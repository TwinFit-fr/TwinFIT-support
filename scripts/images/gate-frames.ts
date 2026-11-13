/**
 * Start gate, step 2: from an APPROVED Start, makes End and Mid with the fixed equipment locked.
 * 1. Equipment layer: the model removes the athlete from the Start; the pixels where that layer
 *    matches the Start are the visible fixed equipment (the lock).
 * 2. End: an edit of the Start whose mask leaves only the unlocked area editable, then the locked
 *    pixels are pasted back from the Start (except over skin or the shirt).
 * 3. Mid: an edit of the Start that also sees End, asked for the exact halfway position, same lock.
 * Everything stays LOCAL; production is only read.
 *
 * Usage: npx jiti scripts/images/gate-frames.ts --exo 24 --subject man --start PATH [--n 2] [--quality medium]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import OpenAI from "openai";
import sharp from "sharp";
import { buildImageRequest } from "../../src/lib/images/openai";
import { assembleImagePrompt, exerciseDetails } from "../../src/lib/images/prompt";
import type { GenerationParams } from "../../src/lib/images/types";

const { values: args } = parseArgs({
  options: {
    exo: { type: "string" },
    subject: { type: "string", default: "man" },
    start: { type: "string" },
    n: { type: "string", default: "2" },
    quality: { type: "string", default: "medium" },
    "system-file": { type: "string" },
    out: { type: "string", default: "../gif-pipeline/gate" },
  },
});
if (!args.exo || !args.start) throw new Error("--exo and --start are required");

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
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? readEnvFile(process.env.OPENAI_ENV ?? "/home/jsr90/Twinfit/TwinFIT-support/.env.local").OPENAI_API_KEY,
});
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
const PRICE = { text: 5, imageIn: 8, out: 30 };
let cost = 0;
function addCost(usage: unknown) {
  const u = (usage ?? {}) as { input_tokens_details?: { image_tokens?: number; text_tokens?: number }; output_tokens?: number };
  cost += ((u.input_tokens_details?.text_tokens ?? 0) * PRICE.text + (u.input_tokens_details?.image_tokens ?? 0) * PRICE.imageIn + (u.output_tokens ?? 0) * PRICE.out) / 1e6;
}

const S = 1024;
async function rgba(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes).ensureAlpha().resize(S, S, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer();
}
const png = (raw: Buffer, channels: 3 | 4 = 4) => sharp(raw, { raw: { width: S, height: S, channels } }).png().toBuffer();
/** Skin, or the navy shirt: never paint equipment over these. */
function bodyLike(r: number, g: number, b: number): boolean {
  const skin = r > 110 && r > g && g > b && r - b > 35;
  const shirt = b > r + 12 && b >= g && b > 40;
  return skin || shirt;
}

async function edit(prompt: string, params: GenerationParams, images: Buffer[], mask?: Buffer) {
  const req = buildImageRequest(prompt, params);
  const files = images.map((b, i) => new File([new Uint8Array(b)], `in_${i}.png`, { type: "image/png" }));
  const res = await openai.images.edit({
    model: req.model,
    image: files.length === 1 ? files[0] : files,
    ...(mask ? { mask: new File([new Uint8Array(mask)], "mask.png", { type: "image/png" }) } : {}),
    prompt: req.prompt,
    size: req.size as "1024x1024",
    quality: req.quality as "medium",
    output_format: "png",
    ...(req.background ? { background: req.background as "transparent" } : {}),
  });
  addCost(res.usage);
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image in the edit response");
  return Buffer.from(b64, "base64");
}

async function main() {
  const exoId = Number(args.exo), subject = args.subject!;
  const d = await gql<{
    images_styles: { params: GenerationParams & { background_color?: string }; prompts: { kind: string; position: number | null; content: string }[] }[];
    catalog_exercises: {
      id: string; exo_id: number; display_name: string;
      equipment: { code: string; name: string; description: string | null } | null;
      support_equipment: { code: string; name: string; description: string | null } | null;
      position: { code: string; name: string } | null; grip: { code: string; name: string; description: string | null } | null;
      variation: { code: string; name: string } | null; localizations: { locale: string; description: string | null }[];
    }[];
    images_exercise_poses: { position: number; pose: string }[];
  }>(
    `query($e: Int!) {
      images_styles(where: { code: { _eq: "TWINFIT" } }) { params prompts { kind position content } }
      catalog_exercises(where: { exo_id: { _eq: $e } }) {
        id exo_id display_name equipment { code name description } support_equipment { code name description }
        position { code name } grip { code name description } variation { code name } localizations { locale description }
      }
      images_exercise_poses(where: { exo_id: { _eq: $e } }) { position pose }
    }`,
    { e: exoId },
  );
  const style = d.images_styles[0], exo = d.catalog_exercises[0];
  const params = { ...style.params, quality: args.quality! } as GenerationParams & { background_color?: string };
  const system = args["system-file"] ? readFileSync(args["system-file"], "utf8") : style.prompts.find((p) => p.kind === "system")!.content;
  const pose = (p: number) => d.images_exercise_poses.find((x) => x.position === p)?.pose;
  const base = (p: number) => assembleImagePrompt({
    systemContent: system, positionContent: style.prompts.find((x) => x.kind === "position" && x.position === p)!.content,
    name: exo.display_name, description: exo.localizations.find((l) => l.locale === "en")?.description ?? "",
    pose: pose(p), exo_id: exo.exo_id, id: exo.id, subject, background_color: params.background_color, details: exerciseDetails(exo),
  });
  const dir = path.join(path.resolve(args.out!), `${exoId}-${subject}`, "frames");
  mkdirSync(dir, { recursive: true });
  const startBytes = readFileSync(args.start!);
  const start = await rgba(startBytes);
  const startPng = await png(start);
  writeFileSync(path.join(dir, "start.png"), startPng);

  // 1. Equipment layer and lock.
  const layerFile = path.join(dir, "equipment-layer.png");
  const layerBytes = existsSync(layerFile)
    ? readFileSync(layerFile)
    : await edit(
        "Remove the athlete completely from this image. Keep every piece of equipment (bench, machine, rack, bar, cable, weight stack, footplate, plates) exactly where and how it is: same position, size, angle, colours and illustration style. Redraw only the parts of the equipment that the athlete was hiding. Transparent background, no person, no shadow.",
        params, [startPng],
      );
  writeFileSync(layerFile, layerBytes);
  const layer = await rgba(layerBytes);
  const locked = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const o = i * 4;
    if (start[o + 3] < 200 || layer[o + 3] < 200) continue;
    const diff = Math.abs(start[o] - layer[o]) + Math.abs(start[o + 1] - layer[o + 1]) + Math.abs(start[o + 2] - layer[o + 2]);
    if (diff < 54) locked[i] = 1;
  }
  // Erode by one pixel so edges stay editable.
  const lock = new Uint8Array(S * S);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const i = y * S + x;
    if (locked[i] && locked[i - 1] && locked[i + 1] && locked[i - S] && locked[i + S]) lock[i] = 1;
  }
  // API mask: opaque = keep, transparent = editable. Preview: locked area in cyan over the Start.
  const maskRaw = Buffer.alloc(S * S * 4), preview = Buffer.from(start);
  let lockedPx = 0;
  for (let i = 0; i < S * S; i++) {
    if (lock[i]) {
      maskRaw.set([0, 0, 0, 255], i * 4);
      preview.set([0, 190, 200, 255], i * 4);
      lockedPx++;
    }
  }
  const mask = await png(maskRaw);
  writeFileSync(path.join(dir, "lock-preview.png"), await sharp(await png(preview)).flatten({ background: "#ffffff" }).png().toBuffer());
  console.error(`lock: ${lockedPx} px (${((100 * lockedPx) / (S * S)).toFixed(1)}% of the canvas)`);

  async function pasteLock(bytes: Buffer) {
    const raw = await rgba(bytes);
    let pasted = 0;
    for (let i = 0; i < S * S; i++) {
      if (!lock[i]) continue;
      const o = i * 4;
      if (raw[o + 3] > 128 && bodyLike(raw[o], raw[o + 1], raw[o + 2])) continue;
      raw[o] = start[o]; raw[o + 1] = start[o + 1]; raw[o + 2] = start[o + 2]; raw[o + 3] = start[o + 3];
      pasted++;
    }
    return { bytes: await png(raw), pasted };
  }

  const fixed = "LOCKED EQUIPMENT: every piece of fixed equipment stays exactly as in input image 1, pixel for pixel; only the athlete (and the bar, handle or plate the hands move) changes.";
  const n = Number(args.n);
  for (let k = 1; k <= n; k++) {
    // 2. End.
    const endPrompt = [base(2), `EDIT OF THE START FRAME (INPUT IMAGE 1): input image 1 is the start position of this same exercise and the image to edit. Keep exactly the same character, clothing, chest logo, colours, style, camera angle, zoom and scale. Change only the body pose to the end position described above.`, fixed].join("\n\n");
    const endRaw = await edit(endPrompt, params, [startPng], mask);
    const end = await pasteLock(endRaw);
    writeFileSync(path.join(dir, `end-${k}.png`), end.bytes);
    // 3. Mid, seeing Start and End.
    const midPrompt = [base(1), `EDIT OF THE START FRAME (INPUT IMAGE 1): input image 1 is the START position and the image to edit; input image 2 is the END position of the same repetition. Draw the athlete exactly HALFWAY between image 1 and image 2: every joint angle halfway, the hands, the bar or handle and the body height halfway along the path from image 1 to image 2. Keep exactly the same character, clothing, chest logo, colours, style, camera angle, zoom and scale as image 1.`, fixed].join("\n\n");
    const midRaw = await edit(midPrompt, params, [startPng, end.bytes], mask);
    const mid = await pasteLock(midRaw);
    writeFileSync(path.join(dir, `mid-${k}.png`), mid.bytes);
    console.error(`set ${k}: end pasted ${end.pasted}px, mid pasted ${mid.pasted}px`);
  }
  console.log(JSON.stringify({ costUsd: Math.round(cost * 1000) / 1000, dir }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
