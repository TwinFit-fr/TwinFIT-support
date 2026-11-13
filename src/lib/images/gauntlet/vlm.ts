import type OpenAI from "openai";
import sharp from "sharp";

/** Cheap vision model for the second level of the judge. */
export const DEFAULT_JUDGE_MODEL = "gpt-5-mini";

/** The yes/no questions; keys are stable codes the prompt agent reads. */
export const RUBRIC = {
  start_posture: "Frame 1 shows the body position the exercise needs (standing, seated, lying on the bench, hanging from the bar with feet off the floor...).",
  hands_on_equipment: "In every frame where the exercise uses equipment, both hands hold it or rest on it where they should (no floating bar, no hand off the handle).",
  support_fixed: "The bench, machine, rack or bar is the same object in every frame: same shape, parts, size, place and orientation.",
  same_person: "It is the same person, clothes, colours and logo in every frame.",
  poses_match: "Each frame matches its pose text.",
  anatomy: "No deformed, missing or duplicated limbs, hands or equipment.",
  motion: "Going from frame to frame is a believable movement of this exercise (a correct start and end of the rep).",
} as const;

export type RubricKey = keyof typeof RUBRIC;

export type Tier2Report = {
  model: string;
  checks: Record<RubricKey, { ok: boolean; reason: string }>;
  /** 1-based frame most at fault, or null. */
  worstFrame: number | null;
  score: number;
  usage: { prompt_tokens: number | null; completion_tokens: number | null };
};

/**
 * Calibrated 2026-11-13 on 28 sets rated by eye. The model reliably catches a wrong start posture
 * (standing instead of hanging) and pose/text mismatches, but answers "same equipment" even when
 * a rack or bench was redrawn (gpt-5-mini and gpt-5 alike), so `support_fixed` weighs little.
 */
const WEIGHTS: Record<RubricKey, number> = {
  start_posture: 25,
  hands_on_equipment: 20,
  support_fixed: 5,
  same_person: 10,
  poses_match: 20,
  anatomy: 10,
  motion: 10,
};

const SCHEMA = {
  name: "frame_set_review",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["checks", "worst_frame"],
    properties: {
      checks: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(RUBRIC),
        properties: Object.fromEntries(
          Object.keys(RUBRIC).map((k) => [
            k,
            {
              type: "object",
              additionalProperties: false,
              required: ["ok", "reason"],
              properties: { ok: { type: "boolean" }, reason: { type: "string" } },
            },
          ]),
        ),
      },
      worst_frame: { type: ["integer", "null"] },
    },
  },
} as const;

/** Frames side by side on white, each `tile` px, in the given order. */
export async function contactSheet(frames: Buffer[], tile = 512): Promise<Buffer> {
  const tiles = await Promise.all(
    frames.map((f) =>
      sharp(f).resize(tile, tile, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer(),
    ),
  );
  return sharp({ create: { width: tile * tiles.length, height: tile, channels: 3, background: "#ffffff" } })
    .composite(tiles.map((input, i) => ({ input, left: i * tile, top: 0 })))
    .png()
    .toBuffer();
}

export type SetForReview = {
  name: string;
  description?: string | null;
  bodyPosition?: string | null;
  equipment?: string | null;
  support?: string | null;
  /** One label and pose text per frame, in sheet order. */
  frames: { label: string; pose: string | null }[];
  sheet: Buffer;
};

export function reviewPrompt(set: SetForReview): string {
  const lines = [
    `Exercise: ${set.name}`,
    set.description ? `How it is done: ${set.description}` : null,
    set.bodyPosition ? `Body position: ${set.bodyPosition}` : null,
    set.equipment ? `Load equipment: ${set.equipment}` : null,
    set.support ? `Support equipment: ${set.support}` : null,
    "",
    `The image shows ${set.frames.length} frames of one animation, left to right:`,
    ...set.frames.map((f, i) => `Frame ${i + 1} (${f.label}): ${f.pose ?? "no pose text"}`),
    "",
    "Answer each check strictly; when unsure, answer false and say why in a few words.",
    ...Object.entries(RUBRIC).map(([k, q]) => `- ${k}: ${q}`),
    "worst_frame: the frame number most at fault, or null when all checks pass.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export function scoreChecks(checks: Record<RubricKey, { ok: boolean }>): number {
  let s = 0;
  for (const k of Object.keys(WEIGHTS) as RubricKey[]) if (checks[k]?.ok) s += WEIGHTS[k];
  return s;
}

/** Asks the vision model to review one set. */
export async function tier2(
  client: OpenAI,
  set: SetForReview,
  model = DEFAULT_JUDGE_MODEL,
  effort: "low" | "medium" | "high" = "low",
): Promise<Tier2Report> {
  const url = `data:image/png;base64,${set.sheet.toString("base64")}`;
  const completion = await client.chat.completions.create({
    model,
    reasoning_effort: effort,
    messages: [
      {
        role: "system",
        content:
          "You review exercise illustrations for a fitness app. You check consistency between frames of one animation and biomechanics. Be strict and short.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: reviewPrompt(set) },
          { type: "image_url", image_url: { url, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: SCHEMA as never },
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(raw) as { checks: Tier2Report["checks"]; worst_frame: number | null };
  return {
    model,
    checks: parsed.checks,
    worstFrame: parsed.worst_frame,
    score: scoreChecks(parsed.checks),
    usage: {
      prompt_tokens: completion.usage?.prompt_tokens ?? null,
      completion_tokens: completion.usage?.completion_tokens ?? null,
    },
  };
}
