/**
 * Start gate, step 1: draws N Start candidates per exercise exactly as Support draws a Start
 * (character, support, load equipment and logo references; the style's saved prompts), so a
 * person can pick the one that is right before Mid and End are made from it. Candidates stay
 * LOCAL; production is only read.
 *
 * Usage: npx jiti scripts/images/start-candidates.ts --exo 23,24,42 [--subject man] [--n 3] [--quality medium]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { editImage } from "../../src/lib/images/openai";
import { assembleImagePrompt, exerciseDetails } from "../../src/lib/images/prompt";
import { frameDirectives } from "../../src/lib/images/reference";
import type { GenerationParams } from "../../src/lib/images/types";

const { values: args } = parseArgs({
  options: {
    exo: { type: "string" },
    subject: { type: "string", default: "man" },
    n: { type: "string", default: "3" },
    quality: { type: "string" },
    out: { type: "string", default: "../gif-pipeline/gate" },
    /** File with a full system prompt to use instead of the style's saved one (per-exercise override). */
    "system-file": { type: "string" },
    /** Suffix for candidate file names, to keep earlier rounds. */
    tag: { type: "string", default: "" },
  },
});
if (!args.exo) throw new Error("--exo is required");

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
process.env.OPENAI_API_KEY ??= readEnvFile(process.env.OPENAI_ENV ?? "/home/jsr90/Twinfit/TwinFIT-support/.env.local").OPENAI_API_KEY;

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
const PRICE = { text: 5, imageIn: 8, out: 30 };
function imageCost(usage: Record<string, unknown> | null): number {
  if (!usage) return 0;
  const d = (usage.input_tokens_details ?? {}) as { image_tokens?: number; text_tokens?: number };
  return ((d.text_tokens ?? 0) * PRICE.text + (d.image_tokens ?? 0) * PRICE.imageIn + Number(usage.output_tokens ?? 0) * PRICE.out) / 1e6;
}

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
  const exoIds = args.exo!.split(",").map(Number);
  const subject = args.subject!;
  const d = await gql<{
    images_styles: {
      id: string; params: GenerationParams & { background_color?: string };
      logo_file_id: string | null; logo_in_exercises: boolean;
      characters: { subject: string; file_id: string }[];
      supports: { support_equipment_id: string; file_id: string }[];
      equipment: { equipment_id: string; file_id: string }[];
      prompts: { kind: string; position: number | null; content: string }[];
    }[];
    catalog_exercises: Exo[];
    images_exercise_poses: { exo_id: number; position: number; pose: string }[];
    images_exercise_images: { exo_id: number; file_id: string }[];
  }>(
    `query($exos: [Int!]!, $subject: String!) {
      images_styles(where: { code: { _eq: "TWINFIT" } }) {
        id params logo_file_id logo_in_exercises characters { subject file_id }
        supports { support_equipment_id file_id } equipment { equipment_id file_id }
        prompts { kind position content }
      }
      catalog_exercises(where: { exo_id: { _in: $exos } }) {
        id exo_id display_name equipment { id code name description } support_equipment { id code name description }
        position { code name } grip { code name description } variation { code name } localizations { locale display_name description }
      }
      images_exercise_poses(where: { exo_id: { _in: $exos }, position: { _eq: 0 } }) { exo_id position pose }
      images_exercise_images(where: { exo_id: { _in: $exos }, subject: { _eq: $subject }, active: { _eq: true }, position: { _eq: 0 } }) { exo_id file_id }
    }`,
    { exos: exoIds, subject },
  );
  const style = d.images_styles[0];
  const params = { ...style.params, ...(args.quality ? { quality: args.quality } : {}) } as GenerationParams & { background_color?: string };
  const system = args["system-file"]
    ? readFileSync(args["system-file"], "utf8")
    : style.prompts.find((p) => p.kind === "system")!.content;
  const position0 = style.prompts.find((p) => p.kind === "position" && p.position === 0)!.content;
  const character = style.characters.find((c) => c.subject === subject)!.file_id;
  let total = 0;
  for (const exo of d.catalog_exercises) {
    const dir = path.join(OUT, `${exo.exo_id}-${subject}`);
    mkdirSync(dir, { recursive: true });
    const current = d.images_exercise_images.find((i) => i.exo_id === exo.exo_id);
    if (current) writeFileSync(path.join(dir, "current-start.webp"), await fileBytes(current.file_id));
    const supportFile = exo.support_equipment ? style.supports.find((s) => s.support_equipment_id === exo.support_equipment!.id)?.file_id : undefined;
    const equipmentFile = exo.equipment ? style.equipment.find((e) => e.equipment_id === exo.equipment!.id)?.file_id : undefined;
    const inputs = [{ bytes: await fileBytes(character), mimeType: "image/webp" }];
    if (supportFile) inputs.push({ bytes: await fileBytes(supportFile), mimeType: "image/webp" });
    if (equipmentFile) inputs.push({ bytes: await fileBytes(equipmentFile), mimeType: "image/webp" });
    const logo = style.logo_in_exercises && style.logo_file_id ? await fileBytes(style.logo_file_id) : null;
    if (logo) inputs.push({ bytes: logo, mimeType: "image/png" });
    const base = assembleImagePrompt({
      systemContent: system, positionContent: position0, name: exo.display_name,
      description: exo.localizations.find((l) => l.locale === "en")?.description ?? "",
      pose: d.images_exercise_poses.find((p) => p.exo_id === exo.exo_id)?.pose,
      exo_id: exo.exo_id, id: exo.id, subject, background_color: params.background_color, details: exerciseDetails(exo),
    });
    const prompt = [base, ...frameDirectives({ kind: "start", primary: true, support: Boolean(supportFile), equipment: Boolean(equipmentFile), references: [], logo: Boolean(logo) })].join("\n\n");
    writeFileSync(path.join(dir, `start-prompt${args.tag}.txt`), prompt);
    const results = await Promise.all(
      Array.from({ length: Number(args.n) }, (_, k) =>
        editImage(prompt, params, inputs, { useFidelity: true }).then((r) => {
          writeFileSync(path.join(dir, `cand${args.tag}-${k + 1}.webp`), r.bytes);
          return imageCost(r.usage);
        }),
      ),
    );
    const cost = results.reduce((a, b) => a + b, 0);
    total += cost;
    console.error(`${exo.exo_id} ${exo.display_name}: ${results.length} candidates, $${cost.toFixed(3)}`);
  }
  console.log(JSON.stringify({ costUsd: Math.round(total * 1000) / 1000, quality: params.quality }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
