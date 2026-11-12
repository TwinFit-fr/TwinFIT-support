/**
 * When an exercise opens, the stage camera follows the body for a few seconds: its poses or its
 * clip arrive a moment after the exercise is picked. This decides, from the body's box sampled
 * every few frames, when to frame it and which box. Pure, for node:test.
 *
 * A held pose (the pose editor, paused) is framed once it stops changing, and again if it settles
 * somewhere else (the draft's poses replaced the first body). A moving body (a clip playing) is
 * framed at once and then only grows to everything it reached, so the camera never pumps in and
 * out with the movement.
 */

import type { Vec3 } from "./stage-camera.ts";

export type Bounds = { min: Vec3; max: Vec3 };

export type FollowState = {
  /** The last sampled box, and for how many samples in a row it has not moved. */
  last: Bounds | null;
  stable: number;
  /** The box the camera framed last; null before the first framing. */
  framed: Bounds | null;
};

/** Metres: a box that moves less than STILL between samples is still; one that differs by DIFFERS from what was framed is framed again. */
export const STILL_M = 0.03;
export const DIFFERS_M = 0.1;
export const STABLE_SAMPLES = 2;

export const START_FOLLOW: FollowState = { last: null, stable: 0, framed: null };

const close = (a: Bounds, b: Bounds, tolerance: number) => [0, 1, 2].every((i) => Math.abs(a.min[i] - b.min[i]) <= tolerance && Math.abs(a.max[i] - b.max[i]) <= tolerance);

export function unionOf(a: Bounds, b: Bounds): Bounds {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

/** Does `b` reach more than `by` metres past `a` on any side? */
export function outgrows(a: Bounds, b: Bounds, by = DIFFERS_M): boolean {
  return [0, 1, 2].some((i) => b.min[i] < a.min[i] - by || b.max[i] > a.max[i] + by);
}

/** One sample: the next state, and the box to frame now (null: leave the camera). */
export function followStep(state: FollowState, box: Bounds, moving: boolean): { state: FollowState; frame: Bounds | null } {
  const stable = state.last && close(state.last, box, STILL_M) ? state.stable + 1 : 0;
  const next: FollowState = { last: box, stable, framed: state.framed };
  if (moving) {
    if (!state.framed) return { state: { ...next, framed: box }, frame: box };
    if (outgrows(state.framed, box)) {
      const grown = unionOf(state.framed, box);
      return { state: { ...next, framed: grown }, frame: grown };
    }
    return { state: next, frame: null };
  }
  if (stable >= STABLE_SAMPLES && (!state.framed || !close(state.framed, box, DIFFERS_M))) return { state: { ...next, framed: box }, frame: box };
  return { state: next, frame: null };
}

/** The stage must keep one size this long (ms) before the body is framed: a panel or window still resizing is not its final size. */
export const SIZE_SETTLE_MS = 250;

export type SizeWatch = { width: number; height: number; since: number };

/** One look at the stage's size: the watch to keep, and whether the size has held long enough. */
export function watchSize(prev: SizeWatch | null, width: number, height: number, now: number): { watch: SizeWatch; settled: boolean } {
  const same = prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1;
  const watch = same ? prev : { width, height, since: now };
  return { watch, settled: now - watch.since >= SIZE_SETTLE_MS };
}

/** The follow outlives the last change of the stage's overlays by this long (ms): the body is checked against the free area again. */
export const OVERLAY_SETTLE_MS = 1500;

/** The overlays' rectangles as text, to tell when their layout changed. */
export function obstacleSignature(boxes: readonly { left: number; top: number; right: number; bottom: number }[]): string {
  return boxes.map((b) => [b.left, b.top, b.right, b.bottom].map(Math.round).join(",")).join(";");
}
