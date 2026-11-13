/**
 * Judges every active exercise frame set of a style (read-only on production) and writes a
 * calibration page plus a priority queue. Nothing is written to the database or to Storage.
 *
 * Usage (from TwinFIT-support, Node 24 runs the TypeScript directly):
 *   node scripts/images/judge-catalog.ts [--vlm] [--limit N] [--exo 10,24] [--out DIR]
 *
 * Env:
 *   SECRETS_FILE  file with HASURA_GRAPHQL_ADMIN_SECRET, SUBDOMAIN, REGION
 *                 (default ../TwinFIT-backend/.secrets.remote)
 *   OPENAI_ENV    file with OPENAI_API_KEY, only for --vlm (default .env.local)
 *   CACHE_DIR     where downloaded frames are kept (default <out>/cache)
 *   STYLE_CODE    style to judge (default TWINFIT)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import OpenAI from "openai";
import sharp from "sharp";
import { combinedScore, verdict, type Verdict } from "../../src/lib/images/gauntlet/judge.ts";
import { loadFrame } from "../../src/lib/images/gauntlet/mask.ts";
import { tier1, type Tier1Report } from "../../src/lib/images/gauntlet/metrics.ts";
import { contactSheet, DEFAULT_JUDGE_MODEL, scoreChecks, tier2, type Tier2Report } from "../../src/lib/images/gauntlet/vlm.ts";

const { values: args } = parseArgs({
  options: {
    vlm: { type: "boolean", default: false },
    limit: { type: "string" },
    exo: { type: "string" },
    out: { type: "string", default: "../gif-pipeline/judge" },
    concurrency: { type: "string", default: "4" },
    effort: { type: "string", default: "low" },
    /** Reuse the vision answers of an earlier results.json (rescored with the current weights). */
    reuse: { type: "string" },
  },
});

function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const secrets = readEnvFile(process.env.SECRETS_FILE ?? path.resolve("../../TwinFIT-backend/.secrets.remote"));
const ADMIN = secrets.HASURA_GRAPHQL_ADMIN_SECRET;
const BASE = (svc: string) => `https://${secrets.SUBDOMAIN}.${svc}.${secrets.REGION}.nhost.run/v1`;
if (!ADMIN || !secrets.SUBDOMAIN || !secrets.REGION) throw new Error("SECRETS_FILE lacks admin secret, subdomain or region");

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BASE("hasura")}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hasura-admin-secret": ADMIN },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (body.errors || !body.data) throw new Error(`GraphQL: ${JSON.stringify(body.errors)}`);
  if (/^\s*mutation/i.test(query)) throw new Error("read-only script");
  return body.data;
}

type Img = { id: string; exo_id: number; subject: string; position: number; file_id: string; params: Record<string, unknown> };
type Exo = {
  exo_id: number;
  display_name: string;
  equipment: { code: string; name: string } | null;
  support_equipment: { code: string; name: string } | null;
  position: { code: string; name: string } | null;
  localizations: { locale: string; description: string | null }[];
};
type Pose = { exo_id: number; position: number; pose: string };

const OUT = path.resolve(args.out!);
const CACHE = process.env.CACHE_DIR ?? path.join(OUT, "cache");
mkdirSync(CACHE, { recursive: true });

async function fileBytes(fileId: string): Promise<Buffer> {
  const p = path.join(CACHE, fileId);
  if (existsSync(p)) return readFileSync(p);
  const res = await fetch(`${BASE("storage")}/files/${fileId}`, { headers: { "x-hasura-admin-secret": ADMIN } });
  if (!res.ok) throw new Error(`storage ${fileId}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(p, buf);
  return buf;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const LABEL: Record<number, string> = { 0: "Start", 1: "Mid", 2: "End" };

async function main() {
  const styleCode = process.env.STYLE_CODE ?? "TWINFIT";
  const { images_styles } = await gql<{ images_styles: { id: string }[] }>(
    `query($c: String!) { images_styles(where: { code: { _eq: $c } }) { id } }`,
    { c: styleCode },
  );
  const styleId = images_styles[0]?.id;
  if (!styleId) throw new Error(`style ${styleCode} not found`);

  const data = await gql<{
    active: Img[];
    lineage: { id: string; params: Record<string, unknown> }[];
    catalog_exercises: Exo[];
    images_exercise_poses: Pose[];
  }>(
    `query($s: uuid!) {
      active: images_exercise_images(where: { style_id: { _eq: $s }, active: { _eq: true } }) {
        id exo_id subject position file_id params
      }
      lineage: images_exercise_images(where: { style_id: { _eq: $s }, params: { _has_key: "align_source_image_id" } }) {
        id params
      }
      catalog_exercises(where: { active: { _eq: true } }) {
        exo_id display_name equipment { code name } support_equipment { code name } position { code name }
        localizations { locale description }
      }
      images_exercise_poses { exo_id position pose }
    }`,
    { s: styleId },
  );

  const alignSource = new Map(data.lineage.map((r) => [r.id, r.params.align_source_image_id as string | null]));
  const ancestors = (id: string) => {
    const out = new Set<string>([id]);
    let cur: string | null | undefined = id;
    while (cur && alignSource.get(cur) && !out.has(alignSource.get(cur)!)) {
      cur = alignSource.get(cur)!;
      out.add(cur);
    }
    return out;
  };
  const exos = new Map(data.catalog_exercises.map((e) => [e.exo_id, e]));
  const poses = new Map(data.images_exercise_poses.map((p) => [`${p.exo_id}:${p.position}`, p.pose]));

  const sets = new Map<string, Img[]>();
  for (const img of data.active) {
    const k = `${img.exo_id}:${img.subject}`;
    sets.set(k, [...(sets.get(k) ?? []), img]);
  }
  const exoFilter = args.exo ? new Set(args.exo.split(",").map(Number)) : null;
  let keys = [...sets.keys()]
    .filter((k) => exos.has(Number(k.split(":")[0])))
    .filter((k) => !exoFilter || exoFilter.has(Number(k.split(":")[0])))
    .sort((a, b) => Number(a.split(":")[0]) - Number(b.split(":")[0]) || a.localeCompare(b));
  if (args.limit) keys = keys.slice(0, Number(args.limit));

  const openai = args.vlm
    ? new OpenAI({ apiKey: readEnvFile(process.env.OPENAI_ENV ?? path.resolve("/home/jsr90/Twinfit/TwinFIT-support/.env.local")).OPENAI_API_KEY })
    : null;
  const reused = new Map<string, Tier2Report>();
  if (args.reuse) {
    for (const r of JSON.parse(readFileSync(args.reuse, "utf8")).rows as { key: string; tier2: Tier2Report | null }[]) {
      if (r.tier2) reused.set(r.key, { ...r.tier2, score: scoreChecks(r.tier2.checks) });
    }
  }
  const thumbs = path.join(OUT, "thumbs");
  mkdirSync(thumbs, { recursive: true });

  type Row = {
    key: string; exo_id: number; subject: string; name: string; positions: number[];
    image_ids: string[]; tier1: Tier1Report | null; tier2: Tier2Report | null; score: number; verdict: Verdict; error?: string;
  };
  let done = 0;
  const rows = await pool(keys, Number(args.concurrency), async (key): Promise<Row> => {
    const imgs = sets.get(key)!.sort((a, b) => a.position - b.position);
    const exo = exos.get(imgs[0].exo_id)!;
    const base = {
      key, exo_id: exo.exo_id, subject: imgs[0].subject, name: exo.display_name,
      positions: imgs.map((i) => i.position), image_ids: imgs.map((i) => i.id),
    };
    try {
      if (imgs[0].position !== 0) throw new Error("no active Start");
      const bytes = await Promise.all(imgs.map((i) => fileBytes(i.file_id)));
      const frames = await Promise.all(bytes.map((b) => loadFrame(b, 320)));
      const startIds = ancestors(imgs[0].id);
      const setMismatch = imgs.slice(1).some((i) => {
        const guide = i.params.guide_image_id as string | null | undefined;
        return guide ? !startIds.has(guide) : false;
      });
      const meta = {
        supportCode: exo.support_equipment?.code, positionCode: exo.position?.code, equipmentCode: exo.equipment?.code,
      };
      const t1 = tier1(frames, base.positions, meta, { setMismatch });
      const sheet = await contactSheet(bytes, 512);
      await sharp(sheet).resize({ height: 220 }).webp({ quality: 70 }).toFile(path.join(thumbs, `${exo.exo_id}-${base.subject}.webp`));
      let t2: Tier2Report | null = reused.get(key) ?? null;
      if (openai && !t2) {
        const description = exo.localizations.find((l) => l.locale === "en")?.description ?? null;
        t2 = await tier2(openai, {
          name: exo.display_name,
          description,
          bodyPosition: exo.position?.name,
          equipment: exo.equipment?.code === "NONE" ? null : exo.equipment?.name,
          support: exo.support_equipment?.name,
          frames: imgs.map((i) => ({ label: LABEL[i.position] ?? `#${i.position}`, pose: poses.get(`${exo.exo_id}:${i.position}`) ?? null })),
          sheet,
        }, DEFAULT_JUDGE_MODEL, args.effort as "low" | "medium" | "high");
      }
      return { ...base, tier1: t1, tier2: t2, score: combinedScore(t1, t2), verdict: verdict(t1, t2) };
    } catch (error) {
      return { ...base, tier1: null, tier2: null, score: 0, verdict: "bad", error: error instanceof Error ? error.message : String(error) };
    } finally {
      done++;
      if (done % 20 === 0) console.error(`${done}/${keys.length}`);
    }
  });

  const rank: Record<Verdict, number> = { bad: 0, check: 1, good: 2 };
  rows.sort((a, b) => rank[a.verdict] - rank[b.verdict] || a.score - b.score);
  const usage = rows.reduce(
    (u, r) => ({ p: u.p + (r.tier2?.usage.prompt_tokens ?? 0), c: u.c + (r.tier2?.usage.completion_tokens ?? 0) }),
    { p: 0, c: 0 },
  );
  writeFileSync(
    path.join(OUT, "results.json"),
    JSON.stringify({ style: styleCode, at: new Date().toISOString(), model: openai ? DEFAULT_JUDGE_MODEL : null, usage, rows }, null, 1),
  );
  writeFileSync(path.join(OUT, "queue.json"), JSON.stringify(rows.map((r) => ({ key: r.key, name: r.name, verdict: r.verdict, score: r.score })), null, 1));
  console.log(JSON.stringify({ sets: rows.length, errors: rows.filter((r) => r.error).length, usage }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
