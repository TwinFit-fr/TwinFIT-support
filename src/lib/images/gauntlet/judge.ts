import type { Tier1Report } from "./metrics.ts";
import type { RubricKey, Tier2Report } from "./vlm.ts";

export type Verdict = "good" | "check" | "bad";

/** Silhouette failures that make a set unusable as it is. */
const HARD = new Set(["empty_frame", "opaque_background", "reframed", "set_mismatch"]);
/** Vision checks the model answers reliably enough to reject a set on. */
const BAD_VISION: ReadonlySet<RubricKey> = new Set(["start_posture"]);

/**
 * The judge's verdict on a set, from rules calibrated on 28 sets rated by eye (2026-11-13):
 * - bad: a hard silhouette failure, or the model sees a wrong start posture;
 * - check: two or more other vision failures, or a silhouette score under 80;
 * - good: everything else.
 * Not detected: a bench, machine or rack redrawn between frames when the posture is right.
 */
export function verdict(t1: Tier1Report | null, t2: Tier2Report | null): Verdict {
  if (!t1) return "bad";
  if (t1.failures.some((f) => HARD.has(f.code))) return "bad";
  const visionFails = t2
    ? (Object.entries(t2.checks) as [RubricKey, { ok: boolean }][]).filter(([, v]) => !v.ok).map(([k]) => k)
    : [];
  if (visionFails.some((k) => BAD_VISION.has(k))) return "bad";
  if (visionFails.length >= 2 || t1.score < 80) return "check";
  return "good";
}

/** Score for ordering a queue: the mean of both levels (silhouette alone without vision). */
export function combinedScore(t1: Tier1Report | null, t2: Tier2Report | null): number {
  if (!t1) return 0;
  return t2 ? Math.round((t1.score + t2.score) / 2) : t1.score;
}
