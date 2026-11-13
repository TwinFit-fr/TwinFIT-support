import type OpenAI from "openai";
import type { Failure } from "./metrics.ts";

export const DEFAULT_AGENT_MODEL = "gpt-5-mini";

/** Inputs the agent may leave out of the next attempt (the generator's skippable inputs). */
export type AgentSkip = "support" | "logo";

export type Attempt = {
  override: string | null;
  skip: AgentSkip[];
  verdict: string;
  score: number;
  failures: string[];
};

export type AgentInput = {
  exercise: string;
  frameLabel: string;
  pose: string | null;
  /** The slot's saved position prompt (template with placeholders such as {pose}). */
  basePrompt: string;
  /** Failures of the last attempt, silhouette and vision. */
  failures: Failure[];
  vision: { check: string; reason: string }[];
  history: Attempt[];
};

export type AgentProposal = {
  /** Full position prompt for the next attempt: the base text plus a CORRECTIONS block. */
  override: string;
  skip: AgentSkip[];
  rationale: string;
  /** Nothing a prompt can fix (wrong pose text, bad Start): hand over to a person. */
  giveUp: boolean;
};

const SCHEMA = {
  name: "prompt_revision",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["corrections", "skip_support", "rationale", "give_up"],
    properties: {
      corrections: {
        type: "array",
        description: "Short imperative sentences, one per failure you address (max 4).",
        items: { type: "string" },
      },
      skip_support: { type: "boolean" },
      rationale: { type: "string" },
      give_up: { type: "boolean" },
    },
  },
} as const;

const SYSTEM = `You tune the per-exercise prompt of an image-editing model that draws one frame of an exercise animation by editing the Start frame (input image 1).
You receive what went wrong in the last attempt and the history of attempts. Write at most 4 short corrective sentences that address the failures, in plain English, concrete and visual (positions of hands, feet, bench, bar; what must stay identical to input image 1).
Rules:
- Never contradict the base prompt or ask to move, rotate, mirror or redraw the bench, machine or bar: they stay exactly as in input image 1.
- Do not repeat a correction that already failed twice; try a different wording or angle.
- skip_support = true only when the equipment card seems to make the model redraw the bench or machine.
- give_up = true when the failure cannot be fixed by the prompt (the pose text itself is wrong, or the Start frame is wrong).`;

/** Builds the override from the base prompt and the corrections (pure, testable). */
export function withCorrections(basePrompt: string, corrections: string[]): string {
  const lines = corrections.map((c) => c.trim()).filter(Boolean).slice(0, 4);
  if (!lines.length) return basePrompt;
  return `${basePrompt.trim()}\n\nCORRECTIONS FOR THIS EXERCISE:\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

export function agentPrompt(input: AgentInput): string {
  return [
    `Exercise: ${input.exercise}. Frame: ${input.frameLabel}.`,
    `Pose text: ${input.pose ?? "(none)"}`,
    "",
    "Last attempt failures:",
    ...input.failures.map((f) => `- [silhouette] ${f.code}: ${f.detail}`),
    ...input.vision.map((v) => `- [vision] ${v.check}: ${v.reason}`),
    "",
    "History (oldest first):",
    ...(input.history.length
      ? input.history.map(
          (h, i) =>
            `${i + 1}. verdict ${h.verdict} (${h.score}); skipped ${h.skip.join(",") || "nothing"}; corrections: ${
              h.override?.split("CORRECTIONS FOR THIS EXERCISE:")[1]?.trim().replace(/\n/g, " ") || "none"
            }; failures: ${h.failures.join(", ") || "none"}`,
        )
      : ["(first revision)"]),
  ].join("\n");
}

export async function proposeRevision(
  client: OpenAI,
  input: AgentInput,
  model = DEFAULT_AGENT_MODEL,
): Promise<AgentProposal & { usage: { prompt_tokens: number | null; completion_tokens: number | null } }> {
  const completion = await client.chat.completions.create({
    model,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: agentPrompt(input) },
    ],
    response_format: { type: "json_schema", json_schema: SCHEMA as never },
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    corrections?: string[];
    skip_support?: boolean;
    rationale?: string;
    give_up?: boolean;
  };
  return {
    override: withCorrections(input.basePrompt, parsed.corrections ?? []),
    skip: parsed.skip_support ? ["support", "logo"] : ["logo"],
    rationale: parsed.rationale ?? "",
    giveUp: Boolean(parsed.give_up),
    usage: {
      prompt_tokens: completion.usage?.prompt_tokens ?? null,
      completion_tokens: completion.usage?.completion_tokens ?? null,
    },
  };
}
