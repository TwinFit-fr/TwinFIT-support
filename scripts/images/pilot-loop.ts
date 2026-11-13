/**
 * Pilot of the generation loop: for each exercise set, regenerates End (when the judge does not
 * pass it) and Mid, fixing framing against the Start, judging every attempt and letting the
 * prompt agent revise the exercise's prompt between attempts. Candidates stay LOCAL: nothing is
 * written to the database or to Storage (production is only read, with the admin secret).
 *
 * Usage (from TwinFIT-support; jiti resolves the app's extensionless imports):
 *   npx jiti scripts/images/pilot-loop.ts --exo 10,80 [--subject man] [--max-iter 3] [--out DIR]
 *
 * Env: SECRETS_FILE (default ../../TwinFIT-backend/.secrets.remote), OPENAI_ENV (default .env.local
 * of the main TwinFIT-support checkout), STYLE_CODE (default TWINFIT).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import OpenAI from "openai";
import { editImage } from "../../src/lib/images/openai";
import { assembleImagePrompt, exerciseDetails } from "../../src/lib/images/prompt";
import { frameDirectives } from "../../src/lib/images/reference";
import type { GenerationParams } from "../../src/lib/images/types";
import { proposeRevision, type AgentSkip, type Attempt } from "../../src/lib/images/gauntlet/agent";
import { applyRegistrationRaw, decodeRaw, encodeRaw, lockStatic } from "../../src/lib/images/gauntlet/apply";
import { anchorFor } from "../../src/lib/images/gauntlet/anchors";
import { combinedScore, verdict, type Verdict } from "../../src/lib/images/gauntlet/judge";
import { loadFrame } from "../../src/lib/images/gauntlet/mask";
import { THRESHOLDS, tier1, type Tier1Report } from "../../src/lib/images/gauntlet/metrics";
import { register } from "../../src/lib/images/gauntlet/register";
import { contactSheet, tier2, type Tier2Report } from "../../src/lib/images/gauntlet/vlm";

const { values: args } = parseArgs({
  options: {
    exo: { type: "string" },
    subject: { type: "string" },
    "max-iter": { type: "string", default: "3" },
    out: { type: "string", default: "../gif-pipeline/pilot" },
    concurrency: { type: "string", default: "4" },
  },
});
if (!args.exo) throw new Error("--exo is required (comma-separated exo ids)");

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
process.env.OPENAI_API_KEY ??= readEnvFile(
  process.env.OPENAI_ENV ?? "/home/jsr90/Twinfit/TwinFIT-support/.env.local",
).OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (/^\s*mutation/i.test(query)) throw new Error("read-only script");
  const res = await fetch(`${BASE("hasura")}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hasura-admin-secret": ADMIN },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (body.errors || !body.data) throw new Error(`GraphQL: ${JSON.stringify(body.errors)}`);
  return body.data;
}

const OUT = path.resolve(args.out!);
const CACHE = path.join(OUT, "cache");
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

/** Image API prices per 1M tokens (developers.openai.com pricing, fetched 2026-11-13). */
const PRICE = { text: 5, imageIn: 8, out: 30 };
function imageCost(usage: Record<string, unknown> | null): number {
  if (!usage) return 0;
  const d = (usage.input_tokens_details ?? {}) as { image_tokens?: number; text_tokens?: number };
  return ((d.text_tokens ?? 0) * PRICE.text + (d.image_tokens ?? 0) * PRICE.imageIn + Number(usage.output_tokens ?? 0) * PRICE.out) / 1e6;
}
/** gpt-5-mini per 1M tokens (estimate). */
const llmCost = (u: { prompt_tokens: number | null; completion_tokens: number | null }) =>
  ((u.prompt_tokens ?? 0) * 0.25 + (u.completion_tokens ?? 0) * 2) / 1e6;

const LABEL = ["Start", "Mid", "End"];

type Exo = {
  id: string; exo_id: number; display_name: string;
  equipment: { id: string; code: string; name: string; description: string | null } | null;
  support_equipment: { id: string; code: string; name: string; description: string | null } | null;
  position: { code: string; name: string } | null;
  grip: { code: string; name: string; description: string | null } | null;
  variation: { code: string; name: string } | null;
  localizations: { locale: string; display_name: string; description: string | null }[];
};

async function main() {
  const styleCode = process.env.STYLE_CODE ?? "TWINFIT";
  const exoIds = args.exo!.split(",").map(Number);
  const data = await gql<{
    images_styles: {
      id: string; params: GenerationParams & { background_color?: string };
      supports: { support_equipment_id: string; file_id: string }[];
      equipment: { equipment_id: string; file_id: string }[];
      prompts: { id: string; kind: string; position: number | null; content: string }[];
    }[];
    catalog_exercises: Exo[];
    images_exercise_poses: { exo_id: number; position: number; pose: string }[];
  }>(
    `query($c: String!, $exos: [Int!]!) {
      images_styles(where: { code: { _eq: $c } }) {
        id params
        supports { support_equipment_id file_id }
        equipment { equipment_id file_id }
        prompts { id kind position content }
      }
      catalog_exercises(where: { exo_id: { _in: $exos } }) {
        id exo_id display_name
        equipment { id code name description } support_equipment { id code name description }
        position { code name } grip { code name description } variation { code name }
        localizations { locale display_name description }
      }
      images_exercise_poses(where: { exo_id: { _in: $exos } }) { exo_id position pose }
    }`,
    { c: styleCode, exos: exoIds },
  );
  const style = data.images_styles[0];
  if (!style) throw new Error(`style ${styleCode} not found`);
  const { images_exercise_images: active } = await gql<{
    images_exercise_images: { id: string; exo_id: number; subject: string; position: number; file_id: string }[];
  }>(
    `query($s: uuid!, $exos: [Int!]!) {
      images_exercise_images(where: { style_id: { _eq: $s }, active: { _eq: true }, exo_id: { _in: $exos } }) {
        id exo_id subject position file_id
      }
    }`,
    { s: style.id, exos: exoIds },
  );
  const system = style.prompts.find((p) => p.kind === "system")!;
  const positionPrompt = (pos: number) => style.prompts.find((p) => p.kind === "position" && p.position === pos)!;

  const sets: { exo: Exo; subject: string }[] = [];
  for (const exo of data.catalog_exercises) {
    for (const subject of args.subject ? [args.subject] : ["man", "woman"]) sets.push({ exo, subject });
  }

  const summary: unknown[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Number(args.concurrency) }, async () => {
      while (next < sets.length) {
        const job = sets[next++];
        try {
          summary.push(await runSet(job.exo, job.subject));
        } catch (error) {
          summary.push({ key: `${job.exo.exo_id}-${job.subject}`, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }),
  );
  writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
  const cost = (summary as { cost?: number }[]).reduce((a, s) => a + (s.cost ?? 0), 0);
  console.log(JSON.stringify({ sets: summary.length, costUsd: Math.round(cost * 1000) / 1000 }));

  async function runSet(exo: Exo, subject: string) {
    const key = `${exo.exo_id}-${subject}`;
    const dir = path.join(OUT, key);
    mkdirSync(dir, { recursive: true });
    const log: Record<string, unknown> & { attempts: unknown[] } = { key, name: exo.display_name, attempts: [] };
    let cost = 0;
    const mine = active.filter((a) => a.exo_id === exo.exo_id && a.subject === subject);
    const startImg = mine.find((a) => a.position === 0);
    if (!startImg) return { key, skipped: "no active Start" };
    const current: (Buffer | null)[] = [0, 1, 2].map(() => null);
    for (const a of mine) current[a.position] = await fileBytes(a.file_id);
    writeFileSync(path.join(dir, "before-0.webp"), current[0]!);
    if (current[1]) writeFileSync(path.join(dir, "before-1.webp"), current[1]);
    if (current[2]) writeFileSync(path.join(dir, "before-2.webp"), current[2]);

    const meta = { supportCode: exo.support_equipment?.code, positionCode: exo.position?.code, equipmentCode: exo.equipment?.code };
    const description = exo.localizations.find((l) => l.locale === "en")?.description ?? "";
    const poses = new Map(data.images_exercise_poses.filter((p) => p.exo_id === exo.exo_id).map((p) => [p.position, p.pose]));

    async function judge(frames: (Buffer | null)[]): Promise<{ t1: Tier1Report; t2: Tier2Report; verdict: Verdict; score: number }> {
      const positions = [0, 1, 2].filter((p) => frames[p]);
      const bytes = positions.map((p) => frames[p]!);
      const t1 = tier1(await Promise.all(bytes.map((b) => loadFrame(b, 320))), positions, meta);
      const t2 = await tier2(openai, {
        name: exo.display_name, description,
        bodyPosition: exo.position?.name,
        equipment: exo.equipment?.code === "NONE" ? null : exo.equipment?.name,
        support: exo.support_equipment?.name,
        frames: positions.map((p) => ({ label: LABEL[p], pose: poses.get(p) ?? null })),
        sheet: await contactSheet(bytes, 512),
      });
      cost += llmCost(t2.usage);
      return { t1, t2, verdict: verdict(t1, t2), score: combinedScore(t1, t2) };
    }

    const baseline = await judge(current);
    log.baseline = { verdict: baseline.verdict, score: baseline.score, failures: baseline.t1.failures, vision: baseline.t2.checks };
    if (!baseline.t2.checks.start_posture.ok) {
      log.result = "Start needs a person: wrong start posture";
      writeFileSync(path.join(dir, "log.json"), JSON.stringify(log, null, 1));
      return { key, name: exo.display_name, baseline: baseline.verdict, result: log.result, cost };
    }

    const startRaw = await decodeRaw(current[0]!);
    const startFrame = await loadFrame(current[0]!, 320);
    const anchor = anchorFor(meta);
    const chosen = [...current];

    async function generate(position: number, override: string | null, skip: AgentSkip[]) {
      const supportFile = exo.support_equipment && !skip.includes("support")
        ? style.supports.find((s) => s.support_equipment_id === exo.support_equipment!.id)?.file_id
        : undefined;
      const equipmentFile = exo.equipment
        ? style.equipment.find((e) => e.equipment_id === exo.equipment!.id)?.file_id
        : undefined;
      const inputs = [{ bytes: current[0]!, mimeType: "image/webp" }];
      if (supportFile) inputs.push({ bytes: await fileBytes(supportFile), mimeType: "image/webp" });
      if (equipmentFile) inputs.push({ bytes: await fileBytes(equipmentFile), mimeType: "image/webp" });
      const base = assembleImagePrompt({
        systemContent: system.content,
        positionContent: override ?? positionPrompt(position).content,
        name: exo.display_name, description, pose: poses.get(position), exo_id: exo.exo_id, id: exo.id, subject,
        background_color: style.params.background_color, details: exerciseDetails(exo),
      });
      const directives = frameDirectives({
        kind: "edit", primary: true, support: Boolean(supportFile), equipment: Boolean(equipmentFile), references: [], logo: false,
      });
      const prompt = [base, ...directives].join("\n\n");
      const result = await editImage(prompt, style.params, inputs, { useFidelity: true });
      cost += imageCost(result.usage);
      // Fixer: register on the anchor, correct only a clean fit, then lock near-identical pixels.
      let raw = await decodeRaw(result.bytes);
      const reg = register(startFrame, await loadFrame(result.bytes, 320), anchor);
      let corrected = false;
      if (reg && reg.iouAfter >= THRESHOLDS.anchorIou && !reg.atLimit && (Math.abs(reg.scale - 1) > 0.005 || Math.abs(reg.dx) > 0.003 || Math.abs(reg.dy) > 0.003)) {
        raw = applyRegistrationRaw(raw, reg);
        corrected = true;
      }
      const locked = lockStatic(startRaw, raw);
      return { bytes: await encodeRaw(locked.raw), prompt, reg, corrected, locked: locked.locked };
    }

    const maxIter = Number(args["max-iter"]);
    // End first (only when the set fails), then Mid against the chosen End.
    const targets = baseline.verdict === "good" ? [1] : [2, 1];
    for (const position of targets) {
      let override: string | null = null;
      let skip: AgentSkip[] = ["logo"];
      const history: Attempt[] = [];
      let best: { bytes: Buffer; score: number; verdict: Verdict; iter: number } | null = null;
      if (position === 2 && current[2]) best = { bytes: current[2], score: baseline.score, verdict: baseline.verdict, iter: 0 };
      for (let iter = 1; iter <= maxIter; iter++) {
        const g = await generate(position, override, skip);
        const file = `p${position}-try${iter}.webp`;
        writeFileSync(path.join(dir, file), g.bytes);
        const frames = [...chosen];
        frames[position] = g.bytes;
        const j = await judge(frames);
        const mineFailures = j.t1.failures.filter((f) => f.frame === position || f.frame === null);
        const visionFails = Object.entries(j.t2.checks).filter(([, v]) => !v.ok).map(([k, v]) => ({ check: k, reason: v.reason }));
        log.attempts.push({
          position, iter, file, verdict: j.verdict, score: j.score, override, skip,
          registration: g.reg && { scale: g.reg.scale, dx: g.reg.dx, dy: g.reg.dy, iouBefore: g.reg.iouBefore, iouAfter: g.reg.iouAfter, atLimit: g.reg.atLimit },
          corrected: g.corrected, lockedPx: g.locked, failures: mineFailures, vision: visionFails,
        });
        if (!best || j.score > best.score || (j.verdict === "good" && best.verdict !== "good")) {
          best = { bytes: g.bytes, score: j.score, verdict: j.verdict, iter };
        }
        if (j.verdict === "good") break;
        history.push({ override, skip, verdict: j.verdict, score: j.score, failures: [...mineFailures.map((f) => f.code), ...visionFails.map((v) => v.check)] });
        if (iter === maxIter) break;
        const proposal = await proposeRevision(openai, {
          exercise: exo.display_name, frameLabel: LABEL[position], pose: poses.get(position) ?? null,
          basePrompt: positionPrompt(position).content, failures: mineFailures, vision: visionFails, history,
        });
        cost += llmCost(proposal.usage);
        log.attempts.push({ position, iter, agent: { rationale: proposal.rationale, giveUp: proposal.giveUp, skip: proposal.skip, override: proposal.override } });
        if (proposal.giveUp) break;
        override = proposal.override;
        skip = proposal.skip;
      }
      if (best) {
        chosen[position] = best.bytes;
        writeFileSync(path.join(dir, `after-${position}.webp`), best.bytes);
        log[`chosen_${position}`] = { iter: best.iter, verdict: best.verdict, score: best.score };
      }
    }
    chosen.forEach((bytes, p) => bytes && writeFileSync(path.join(dir, `after-${p}.webp`), bytes));
    const final = await judge(chosen);
    log.final = { verdict: final.verdict, score: final.score, failures: final.t1.failures, vision: final.t2.checks };
    log.costUsd = Math.round(cost * 1000) / 1000;
    writeFileSync(path.join(dir, "log.json"), JSON.stringify(log, null, 1));
    console.error(`${key}: ${baseline.verdict} ${baseline.score} -> ${final.verdict} ${final.score} ($${log.costUsd})`);
    return { key, name: exo.display_name, baseline: baseline.verdict, baselineScore: baseline.score, final: final.verdict, finalScore: final.score, cost };
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
