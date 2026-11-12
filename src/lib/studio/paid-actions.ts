/**
 * What a paid provider action costs and takes, and the words of the confirmation shown before it
 * is sent. Only the estimates the Studio already stated are used (35 credits and 3 to 5 minutes for
 * a Meshy avatar, about 30 credits for a Meshy equipment model, about ten seconds for an AI pose
 * draft, 30 s between two worker attempts); what is not known is said to be set by the provider,
 * never guessed. Pure.
 */

export type PaidEstimate = {
  /** Credits per task, as the Studio estimates them; null when not known. */
  credits: number | null;
  /** Expected duration in words; null when the Studio has no estimate. */
  duration: string | null;
};

/** Meshy image-to-3D in a T-pose, then auto-rigging (avatar-service.ts). */
export const MESHY_AVATAR: PaidEstimate = { credits: 35, duration: "3 to 5 minutes" };
/** Meshy image-to-3D of one implement (equipment-service.ts). No duration estimate exists. */
export const MESHY_EQUIPMENT: PaidEstimate = { credits: 30, duration: null };

/** "35 cr · 3–5 min": the short form for a tab or a button. */
export function shortEstimate(e: PaidEstimate): string {
  return [e.credits !== null ? `${e.credits} cr` : null, e.duration ? e.duration.replace(/(\d+) to (\d+) minutes/, "$1–$2 min") : null].filter(Boolean).join(" · ");
}

/** The provider the action spends with: Meshy credits, or OpenAI usage for an AI movement. */
export type PaidProvider = "Meshy" | "OpenAI";

export type PaidRequest = {
  provider: PaidProvider;
  title: string;
  /** What will happen, in one or two sentences. */
  action: string;
  /** What it is for (the avatar, the implement, how many). */
  subject: string;
  /** Where it starts from (the reference image, a picked file). */
  source?: string;
  cost: string;
  duration: string;
  /** Total credits the estimate adds up to, for the balance check; null when not known. */
  credits: number | null;
  confirmLabel: string;
};

/** The cost line: per task and in total, or charged by the provider when the Studio has no number. */
export function costText(e: PaidEstimate, count = 1, provider = "Meshy"): string {
  if (e.credits === null) return `Charged by ${provider} per request; the Studio has no estimate`;
  if (count <= 1) return `About ${e.credits} ${provider} credits`;
  return `About ${e.credits} credits each, about ${e.credits * count} in total`;
}

export function durationText(e: PaidEstimate, provider = "Meshy", count = 1): string {
  if (e.duration) return count > 1 ? `${e.duration} each; ${provider} runs them side by side` : e.duration;
  return `No estimate in the Studio; ${provider} reports progress as it goes`;
}

export function avatarBuildRequest(input: { name: string; subject: string; retry?: boolean; customImage?: string | null }): PaidRequest {
  const e = MESHY_AVATAR;
  return {
    provider: "Meshy",
    title: input.retry ? `Build ${input.name} again with Meshy?` : `Build ${input.name} with Meshy?`,
    action: "Makes a 3D model of the character in a T-pose, rigs it with a Mixamo skeleton and adds it to the avatar menu. Your current avatar stays on the stage until you choose the new one.",
    subject: `${input.name} (${input.subject})`,
    source: input.customImage ? `Your image ${input.customImage}` : input.retry ? "The same reference image as before" : "The character image of the default style",
    cost: costText(e),
    duration: durationText(e),
    credits: e.credits,
    confirmLabel: input.retry ? `Build again · ${e.credits} credits` : `Start build · ${e.credits} credits`,
  };
}

export function equipmentBuildRequest(input: { names: readonly string[]; customImage?: string | null; replacesReady?: boolean; retry?: boolean }): PaidRequest {
  const e = MESHY_EQUIPMENT;
  const n = input.names.length;
  const bulk = n > 1;
  const list = bulk ? `${n} implements: ${input.names.slice(0, 4).join(", ")}${n > 4 ? ` and ${n - 4} more` : ""}` : (input.names[0] ?? "");
  const total = e.credits !== null ? e.credits * Math.max(1, n) : null;
  return {
    provider: "Meshy",
    title: bulk ? `Generate ${n} missing models with Meshy?` : input.retry ? `Generate the ${list} model again?` : `Generate a ${list} model with Meshy?`,
    action: `${bulk ? "One Meshy image-to-3D task per implement" : "A Meshy image-to-3D task"} that makes a textured 3D model the viewer can draw.${input.replacesReady ? " The model in use stays until you pick the new one." : ""}`,
    subject: list,
    source: input.customImage ? `Your image ${input.customImage}` : "The catalog reference image of the default style",
    cost: costText(e, n),
    duration: durationText(e),
    credits: total,
    confirmLabel: total !== null ? `Generate · about ${total} credits` : "Generate",
  };
}

/** The model that drafts the poses when none is set (DEFAULT_POSE_LLM_MODEL in pose-llm.ts, server only). */
export const DEFAULT_DRAFT_MODEL = "gpt-5-mini";
/** The AI draft's own estimate for one model answer (ai-draft.tsx). */
const DRAFT_DURATION = "about ten seconds";
/** RETRY_DELAY_MS of the worker (worker.ts). */
const RETRY_DELAY = "30 s";

/**
 * Generate movement, or a failed one put back in the queue: one row the open Studio tab runs, the
 * language model writing the key poses, checked as a body, up to the row's attempts. OpenAI bills
 * the usage; the Studio has no price for it.
 */
export function generationRequest(input: { exercise: string; avatar: string; model?: string | null; retry?: boolean; seq?: number | null }): PaidRequest {
  const model = input.model?.trim() || `${DEFAULT_DRAFT_MODEL} (the default)`;
  const name = input.seq ? `${input.exercise} #${input.seq}` : input.exercise;
  return {
    provider: "OpenAI",
    title: input.retry ? `Generate ${name} again?` : `Generate a movement for ${input.exercise}?`,
    action: `The AI reads the catalog texts and frames of the exercise and writes its key poses, then checks them as a body. The clip lands in Clips & queue as a draft to fix and save; the poses on the stage stay as they are.`,
    subject: `${name} on ${input.avatar}`,
    source: `OpenAI ${model}`,
    cost: costText({ credits: null, duration: null }, 1, "OpenAI"),
    duration: `${DRAFT_DURATION[0].toUpperCase()}${DRAFT_DURATION.slice(1)} once its turn comes; a failed attempt is tried again ${RETRY_DELAY} later while attempts remain`,
    credits: null,
    confirmLabel: input.retry ? "Put back in the queue" : "Generate",
  };
}

export type BalanceCheck = { text: string; enough: boolean | null };

/** The balance line: what is left and whether it covers the estimate (null when either is unknown). */
export function balanceCheck(balance: number | null | undefined, needed: number | null): BalanceCheck {
  if (balance === null || balance === undefined) return { text: "Not known right now", enough: null };
  if (needed === null) return { text: `${balance} credits left`, enough: null };
  if (balance < needed) return { text: `${balance} credits left, about ${needed} needed`, enough: false };
  return { text: `${balance} credits left`, enough: true };
}
