/**
 * Timing of the timeline dock: where each key pose sits in one loop, which two poses a moment
 * falls between, the nearest key, ruler ticks and the words a screen reader hears. Pure
 * functions only (no store, no DOM). Key times come from keyframeTimes, the same rule the clip
 * builder plays, so a marker sits exactly where its pose is reached.
 */
import { keyframeTimes, type LoopMode } from "./anatomy.ts";

/** One key on the timeline: a pose reached at `t` seconds. `repeat`: that pose came earlier in the loop. */
export type TimelineKey = { t: number; pose: number; repeat: boolean };

/** What the key times depend on (the pose editor's draft has all of it). */
export type TimelineDoc = { poseCount: number; durationS: number; mode: LoopMode; weights?: number[] | null };

/** Loop mode names as the editor shows them. */
export const LOOP_NAME: Record<LoopMode, string> = { cycle: "Cycle", pingpong: "Boomerang", once: "Once" };

export function timelineKeys(doc: TimelineDoc): TimelineKey[] {
  if (doc.poseCount < 1) return [];
  const weights = doc.weights && doc.weights.length === doc.poseCount ? doc.weights : null;
  const seen = new Set<number>();
  return keyframeTimes(doc.poseCount, doc.durationS, doc.mode, weights).map(({ t, position }) => {
    const repeat = seen.has(position);
    seen.add(position);
    return { t, pose: position, repeat };
  });
}

/** Half a frame: a time this close to a key is on that key. */
export function keyTolerance(fps: number): number {
  return 0.5 / Math.max(1, fps || 30);
}

export function clampTime(t: number, durationS: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(Math.max(0, durationS), Math.max(0, t));
}

/** A playback time (which keeps growing while a clip loops) brought into one loop. */
export function wrapTime(t: number, durationS: number): number {
  if (!(durationS > 0) || !Number.isFinite(t)) return 0;
  return ((t % durationS) + durationS) % durationS;
}

/** Index of the key nearest `t` (the earlier one on a tie); -1 without keys. */
export function nearestKey(keys: TimelineKey[], t: number): number {
  let best = -1;
  let gap = Infinity;
  keys.forEach((k, i) => {
    const d = Math.abs(k.t - t);
    if (d < gap - 1e-9) [best, gap] = [i, d];
  });
  return best;
}

/** Index of the key `t` is on (within `tolerance` seconds), else -1. */
export function keyAt(keys: TimelineKey[], t: number, tolerance: number): number {
  const i = nearestKey(keys, t);
  return i >= 0 && Math.abs(keys[i].t - t) <= tolerance ? i : -1;
}

const smoothstep = (u: number) => u * u * (3 - 2 * u);

/**
 * The two keys `t` lies between and how far along: `u` linear, `eased` the blend the clip
 * builder plays (the same search and ease as its clip player).
 */
export function spanAt(keys: TimelineKey[], t: number): { from: number; to: number; u: number; eased: number } {
  if (!keys.length) return { from: -1, to: -1, u: 0, eased: 0 };
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i += 1;
  const to = Math.min(i + 1, keys.length - 1);
  const span = keys[to].t - keys[i].t;
  const u = span > 0 ? Math.min(1, Math.max(0, (t - keys[i].t) / span)) : 0;
  return { from: i, to, u, eased: smoothstep(u) };
}

/** Index of the next key after `t` (dir 1) or the previous one before it (dir -1), beyond `tolerance`; -1 when there is none. */
export function adjacentKey(keys: TimelineKey[], t: number, dir: 1 | -1, tolerance: number): number {
  if (dir > 0) return keys.findIndex((k) => k.t > t + tolerance);
  for (let i = keys.length - 1; i >= 0; i -= 1) if (keys[i].t < t - tolerance) return i;
  return -1;
}

/**
 * Where the playhead rests while pose `pose` is held: at `heldAt` when that is one of the times
 * the pose is reached (a boomerang reaches pose 2 twice), else where it is first reached.
 */
export function heldKeyTime(keys: TimelineKey[], pose: number, heldAt: number | null, tolerance: number): number {
  if (heldAt !== null) {
    const i = keyAt(keys, heldAt, tolerance);
    if (i >= 0 && keys[i].pose === pose) return keys[i].t;
  }
  return keys.find((k) => k.pose === pose)?.t ?? 0;
}

/** `t`, pulled onto a key when within `tolerance` seconds of one. */
export function snapToKey(keys: TimelineKey[], t: number, tolerance: number): number {
  const i = keyAt(keys, t, tolerance);
  return i >= 0 ? keys[i].t : t;
}

const STEPS: { major: number; minor: number }[] = [
  { major: 0.05, minor: 0.01 },
  { major: 0.1, minor: 0.02 },
  { major: 0.2, minor: 0.05 },
  { major: 0.25, minor: 0.05 },
  { major: 0.5, minor: 0.1 },
  { major: 1, minor: 0.25 },
  { major: 2, minor: 0.5 },
  { major: 5, minor: 1 },
  { major: 10, minor: 2 },
];

/**
 * Ruler ticks across `durationS` seconds drawn `widthPx` wide: labelled ticks at the smallest
 * round step that leaves `minLabelPx` between labels, small ticks between them.
 */
export function rulerTicks(durationS: number, widthPx: number, minLabelPx = 56): { t: number; major: boolean }[] {
  if (!(durationS > 0) || !(widthPx > 0)) return [];
  const perSecond = widthPx / durationS;
  const step = STEPS.find((s) => s.major * perSecond >= minLabelPx) ?? STEPS[STEPS.length - 1];
  const minor = step.minor * perSecond >= 6 ? step.minor : step.major;
  const ticks: { t: number; major: boolean }[] = [];
  const count = Math.floor(durationS / minor + 1e-6);
  for (let k = 0; k <= count; k += 1) {
    const t = Math.round(k * minor * 1000) / 1000;
    const ratio = t / step.major;
    ticks.push({ t, major: Math.abs(ratio - Math.round(ratio)) < 1e-6 });
  }
  return ticks;
}

/** Seconds for a label: "1.2 s"; two decimals for the precise readout. */
export function formatSeconds(t: number, digits = 1): string {
  return `${(Math.round(t * 10 ** digits) / 10 ** digits).toFixed(digits)} s`;
}

/** "Pose 2", or "Pose 2 · bottom" when it has a name. */
export function poseName(pose: number, labels: (string | null | undefined)[] | null | undefined): string {
  const name = labels?.[pose]?.trim();
  return name ? `Pose ${pose + 1} · ${name}` : `Pose ${pose + 1}`;
}

/**
 * What the playhead slider says: "1.2 s of 4.0 s, pose 2 · bottom" on a key, "1.6 s of 4.0 s,
 * between pose 2 and pose 3" elsewhere (no pose words for a clip without keys).
 */
export function describeTime(keys: TimelineKey[], t: number, durationS: number, labels: (string | null | undefined)[] | null | undefined, tolerance: number): string {
  const time = `${formatSeconds(t)} of ${formatSeconds(durationS)}`;
  if (!keys.length) return time;
  const on = keyAt(keys, t, tolerance);
  if (on >= 0) return `${time}, p${poseName(keys[on].pose, labels).slice(1)}`;
  const { from, to } = spanAt(keys, t);
  return `${time}, between pose ${keys[from].pose + 1} and pose ${keys[to].pose + 1}`;
}
