/**
 * A dense motion (a pose on every frame, as a capture gives it) reduced to the fewest key poses
 * whose in-between, played the way the pose clip plays it (keyframeTimes for the timing, a
 * smoothstep blend of the angles between two keys), stays within a tolerance of the motion. The
 * moments furthest from what the keys already play are added first, so the extremes come first;
 * keys that turn out not to be needed are taken out again. A hard cap bounds the count. It also
 * proposes the loop mode (cycle, boomerang or once) and the timing weights of the keys.
 *
 * Differences are measured per bone, as the angle between the rotations two poses give it
 * (characterDeltas), in degrees: that is what the eye sees, and the arm's plane does not count
 * while the arm hangs.
 */

import { getPoseValue, keyframeTimes, lerpPose, setPoseValue, type LoopMode, type PoseAngles } from "./anatomy.ts";
import { characterDeltas, type Rig } from "./pose-clip.ts";
import { ANGLE_PATHS, bodyDifference, type Deltas } from "./pose-from-bones.ts";

/** How many key poses the editor holds at most (store.ts MAX_POSES). */
export const MAX_KEY_POSES = 8;

export const DETAILS = ["fewer", "balanced", "more"] as const;
export type Detail = (typeof DETAILS)[number];

/** Each detail level: the largest joint difference allowed (degrees) and the most key poses. */
export const DETAIL_SPEC: Record<Detail, { tolerance: number; cap: number; label: string }> = {
  fewer: { tolerance: 10, cap: 4, label: "Fewer" },
  balanced: { tolerance: 5, cap: 6, label: "Balanced" },
  more: { tolerance: 2.5, cap: MAX_KEY_POSES, label: "More" },
};

export type DenseMotion = {
  /** Seconds of each frame, increasing, from 0. */
  times: number[];
  poses: PoseAngles[];
  /** Length of one loop, seconds (at least the last frame's time). */
  duration: number;
  /** What each frame's bones really did (measuredDeltas), when it differs from what its pose gives: the reported difference is against it. */
  reference?: Deltas[];
};

export type KeyPoses = {
  /** Frame index of each key pose, in order. */
  frames: number[];
  poses: PoseAngles[];
  mode: LoopMode;
  /** Timing weights for buildKeyframes (null: evenly spaced). */
  weights: number[] | null;
  /** The largest joint difference between the key poses as played and the motion, degrees. */
  maxDiff: number;
  /** The frame where it is. */
  worstFrame: number;
  tolerance: number;
  cap: number;
};

/** The largest joint difference between two sets of bone rotations, degrees (see bodyDifference). */
export const deltaDistance = bodyDifference;

const ease = (u: number) => u * u * (3 - 2 * u);

/** Half-width of the smoothing window, seconds. */
const SMOOTH_S = 0.07;

/**
 * Each angle averaged with its neighbours (`half` frames each side, weights falling off linearly),
 * the ends kept as they are so a loop still closes. Flags and the pelvis height follow the frame.
 */
export function smoothPoses(poses: PoseAngles[], half: number): PoseAngles[] {
  if (half < 1 || poses.length < 3) return poses;
  return poses.map((pose, i) => {
    if (i === 0 || i === poses.length - 1) return pose;
    const reach = Math.min(half, i, poses.length - 1 - i);
    let out = pose;
    for (const path of ANGLE_PATHS) {
      let sum = 0;
      let weight = 0;
      for (let k = -reach; k <= reach; k += 1) {
        const w = reach + 1 - Math.abs(k);
        sum += w * (getPoseValue(poses[i + k], path) ?? 0);
        weight += w;
      }
      out = setPoseValue(out, path, sum / weight);
    }
    return out;
  });
}

type Key = { t: number; pose: PoseAngles };

/** The pose the clip plays at `t` between these timed keys (the clip player's search and ease). */
function playAt(keys: Key[], t: number): PoseAngles {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i += 1;
  const next = Math.min(i + 1, keys.length - 1);
  const span = keys[next].t - keys[i].t;
  const u = span > 0 ? ease(Math.min(1, Math.max(0, (t - keys[i].t) / span))) : 0;
  return lerpPose(keys[i].pose, keys[next].pose, u);
}

/** How the motion loops: back to its start (cycle), there and back in mirror time (boomerang), or not at all (once). */
export function proposeLoopMode(deltas: Deltas[], times: number[], duration: number, tolerance: number): LoopMode {
  const last = deltas.length - 1;
  if (last < 1 || deltaDistance(deltas[0], deltas[last]) > tolerance) return "once";
  // A boomerang plays its way back as the mirror of the way there: the frame at T - t matches the one at t.
  const nearest = (t: number) => {
    let best = 0;
    times.forEach((ti, i) => {
      if (Math.abs(ti - t) < Math.abs(times[best] - t)) best = i;
    });
    return best;
  };
  const mirrored = times.every((t, i) => t > duration / 2 || deltaDistance(deltas[i], deltas[nearest(duration - t)]) <= tolerance);
  // ...and it must go somewhere: a capture standing still is a cycle of one pose.
  const moves = deltas.some((d) => deltaDistance(d, deltas[0]) > tolerance);
  return mirrored && moves ? "pingpong" : "cycle";
}

/** Weights that put each key at its frame's time (see keyframeTimes), mean 1; null when evenly spaced. */
function weightsFor(keyTimes: number[], mode: LoopMode, duration: number): number[] | null {
  const n = keyTimes.length;
  if (n < 2) return null;
  const gaps = keyTimes.map((t, i) => (i === 0 ? (mode === "cycle" ? duration - keyTimes[n - 1] : NaN) : t - keyTimes[i - 1]));
  const known = gaps.filter((g) => Number.isFinite(g));
  const mean = known.reduce((a, b) => a + b, 0) / known.length;
  const w = gaps.map((g) => (Number.isFinite(g) ? g / mean : 1));
  if (w.every((v) => Math.abs(v - 1) < 0.02)) return null;
  return w.map((v) => Math.max(0.05, Number(v.toFixed(3))));
}

/** The key poses for a dense motion: see the module comment. */
export function reduceToKeyPoses(motion: DenseMotion, rig: Rig, spec: { tolerance: number; cap: number }): KeyPoses {
  const { times, poses } = motion;
  const n = poses.length;
  if (!n) throw new Error("The motion has no frames");
  const duration = Math.max(motion.duration, times[n - 1]);
  const cap = Math.max(1, Math.min(MAX_KEY_POSES, Math.round(spec.cap)));
  // Keys are taken from the motion with its frame-to-frame noise smoothed away (a capture shakes a
  // degree or two), so noise neither makes keys nor ends up in them; the result is still measured
  // against the motion as it was.
  const smooth = smoothPoses(poses, Math.round(SMOOTH_S / Math.max(1e-3, n > 1 ? times[1] - times[0] : 1)));
  const deltas = smooth.map((p) => characterDeltas(p, rig));
  const reference = motion.reference ?? poses.map((p) => characterDeltas(p, rig));
  const proposed = proposeLoopMode(deltas, times, duration, spec.tolerance);
  // A boomerang plays its way back in mirror time: when that timing does not fit, a cycle (which times each way on its own) is tried too.
  const modes: LoopMode[] = proposed === "pingpong" ? ["pingpong", "cycle"] : [proposed];
  const results = modes.map((mode) => reduceAs(mode, { times, poses, smooth, deltas, reference, duration, cap, tolerance: spec.tolerance }, rig));
  // Within the tolerance: the fewest poses. Otherwise: the closest to the motion.
  const within = results.filter((r) => r.maxDiff <= spec.tolerance);
  if (!within.length) return results.reduce((best, r) => (r.maxDiff < best.maxDiff ? r : best));
  return within.reduce((best, r) => (r.poses.length < best.poses.length || (r.poses.length === best.poses.length && r.maxDiff < best.maxDiff) ? r : best));
}

type Prepared = { times: number[]; poses: PoseAngles[]; smooth: PoseAngles[]; deltas: Deltas[]; reference: Deltas[]; duration: number; cap: number; tolerance: number };

function reduceAs(mode: LoopMode, input: Prepared, rig: Rig): KeyPoses {
  const { times, smooth, deltas, reference, duration, cap, tolerance } = input;
  const n = times.length;
  const frameGap = n > 1 ? times[1] - times[0] : duration;

  // Which frames can be keys: a cycle's last frame is its return to the start, a boomerang's keys are
  // on its way there (the way back plays them in mirror time). Every frame of the loop is measured.
  const all = times.map((_, i) => i);
  const half = mode === "pingpong" ? all.filter((i) => times[i] <= duration / 2 + frameGap / 2) : all;
  const lastKeyable = half[half.length - 1];
  const candidates = mode === "cycle" && duration - times[n - 1] < frameGap / 2 ? half.slice(0, -1) : half;
  const forced = mode === "cycle" ? [0] : [0, lastKeyable];

  const keysOf = (frames: number[]): Key[] => {
    const keys = frames.map((f) => ({ t: times[f], pose: smooth[f] }));
    if (mode === "cycle") keys.push({ t: duration, pose: smooth[frames[0]] });
    if (mode === "pingpong") for (let k = frames.length - 2; k >= 0; k -= 1) keys.push({ t: duration - times[frames[k]], pose: smooth[frames[k]] });
    return keys;
  };
  const errors = (frames: number[]) => {
    const keys = keysOf(frames);
    return all.map((i) => deltaDistance(characterDeltas(playAt(keys, times[i]), rig), deltas[i]));
  };
  const worstOf = (errs: number[]) => errs.reduce((best, e, k) => (e > errs[best] ? k : best), 0);
  /** The keyable frame a frame of the loop stands for (a boomerang's way back maps onto its way there). */
  const keyableOf = (i: number) => (mode === "pingpong" && times[i] > duration / 2 ? half.reduce((b, j) => (Math.abs(times[j] - (duration - times[i])) < Math.abs(times[b] - (duration - times[i])) ? j : b), 0) : i);

  // The clip eases in and out of every key, so the body comes to rest there: keys belong where the
  // motion itself slows down and turns (its extremes, its pauses). Those are tried first; any
  // other frame near the worst difference only when no turning point helps. Two keys closer than
  // `reach` frames would make the body stop twice for nothing.
  const reach = Math.max(2, Math.round(0.12 / Math.max(frameGap, 1e-3)));
  const raw = half.map((i, k) => (k === 0 ? deltaDistance(deltas[half[1] ?? i], deltas[i]) : deltaDistance(deltas[i], deltas[half[k - 1]])));
  const speed = raw.map((_, k) => {
    const window = raw.slice(Math.max(0, k - reach), k + reach + 1);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });
  // A turning point: the slowest moment around it, and much slower than the motion near it (not a wobble of the noise).
  const around = Math.max(reach, Math.round(0.4 / Math.max(frameGap, 1e-3)));
  const turns = half.filter((i, k) => {
    if (k === 0 || !candidates.includes(i)) return false;
    const close = speed.slice(Math.max(0, k - reach), k + reach + 1);
    const wide = speed.slice(Math.max(0, k - around), k + around + 1);
    return close.every((v) => speed[k] <= v) && speed[k] <= 0.35 * Math.max(...wide);
  });
  const spaced = (frames: number[], frame: number) => candidates.includes(frame) && frames.every((f) => Math.abs(f - frame) >= reach) && (mode !== "pingpong" || Math.abs(lastKeyable - frame) >= reach || frame === lastKeyable);
  const score = (frames: number[]) => {
    const errs = errors(frames);
    return { max: Math.max(...errs), mean: errs.reduce((a, b) => a + b, 0) / errs.length };
  };
  // A step helps when it lowers the worst difference clearly, or lowers the overall one without raising the worst.
  const helps = (next: { max: number; mean: number }, now: { max: number; mean: number }) => next.max < now.max - Math.max(0.5, now.max * 0.05) || (next.max <= now.max + 1e-6 && next.mean < now.mean * 0.85);
  const better = (a: { max: number; mean: number }, b: { max: number; mean: number }) => a.max < b.max - 1e-6 || (Math.abs(a.max - b.max) <= 1e-6 && a.mean < b.mean);

  let frames = [...new Set(forced)].sort((a, b) => a - b);
  let current = score(frames);
  while (current.max > tolerance && frames.length < cap) {
    const errs = errors(frames);
    const worst = keyableOf(all[worstOf(errs)]);
    const near = candidates.filter((i) => Math.abs(i - worst) <= reach && !turns.includes(i));
    let best: { frame: number; s: { max: number; mean: number } } | null = null;
    for (const pool of [turns, near]) {
      for (const frame of pool) {
        if (!spaced(frames, frame)) continue;
        const sc = score([...frames, frame].sort((a, b) => a - b));
        if (!best || better(sc, best.s)) best = { frame, s: sc };
      }
      // A turning point that helps is taken before any frame in mid-motion.
      if (best && helps(best.s, current)) break;
    }
    if (!best || !helps(best.s, current)) break;
    frames = [...frames, best.frame].sort((a, b) => a - b);
    current = best.s;
  }
  // Fewest poses: a key goes when the motion stays within the tolerance without it, or comes out
  // no worse (a key taken early in mid-motion that later keys made a hindrance: the body stops there).
  for (let changed = true; changed; ) {
    changed = false;
    const removable = frames.filter((f) => !forced.includes(f));
    const now = Math.max(...errors(frames));
    let best: { f: number; err: number } | null = null;
    for (const f of removable) {
      const err = Math.max(...errors(frames.filter((g) => g !== f)));
      if ((err <= tolerance || err <= now + 1e-6) && (!best || err < best.err)) best = { f, err };
    }
    if (best) {
      frames = frames.filter((g) => g !== best!.f);
      changed = true;
    }
  }

  // Each key on the frame that fits best around it: a turning point read off a shaky capture can be a frame or two early or late.
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;
    for (let k = 0; k < frames.length; k += 1) {
      if (forced.includes(frames[k])) continue;
      let best = { frame: frames[k], s: score(frames) };
      for (let d = -reach; d <= reach; d += 1) {
        const frame = frames[k] + d;
        const others = frames.filter((_, i) => i !== k);
        if (!d || !spaced(others, frame)) continue;
        if ((k > 0 && frame <= frames[k - 1]) || (k < frames.length - 1 && frame >= frames[k + 1])) continue;
        const sc = score(frames.map((f, i) => (i === k ? frame : f)));
        if (better(sc, best.s)) best = { frame, s: sc };
      }
      if (best.frame !== frames[k]) {
        frames = frames.map((f, i) => (i === k ? best.frame : f));
        moved = true;
      }
    }
    if (!moved) break;
  }

  const keyPoses = frames.map((f) => smooth[f]);
  const weights = weightsFor(frames.map((f) => times[f]), mode, duration);
  // Measured once more as the editor will play it, over the whole loop, against what the bones did.
  const played: Key[] = keyframeTimes(keyPoses.length, duration, mode, weights).map(({ t, position }) => ({ t, pose: keyPoses[position] }));
  let maxDiff = 0;
  let worstFrame = 0;
  times.forEach((t, i) => {
    const d = deltaDistance(characterDeltas(playAt(played, t), rig), reference[i]);
    if (d > maxDiff) [maxDiff, worstFrame] = [d, i];
  });
  return { frames, poses: keyPoses, mode, weights, maxDiff, worstFrame, tolerance, cap };
}
