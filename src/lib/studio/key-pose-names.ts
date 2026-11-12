/**
 * Names for the key poses read from a capture, in the exercise's own words: each pose of the
 * exercise's template ("standing", "bottom") names the key pose that looks most like it, when one
 * is close enough; a key pose in between is named after the pose it moves toward ("toward
 * bottom"), and one that resembles nothing is named by its frame. Each template name is used
 * once. Pure: poses are compared as bone rotations (bodyDifference), with no scene.
 */

import type { PoseAngles } from "./anatomy.ts";
import { bodyDifference } from "./body-difference.ts";
import { characterDeltas, type Rig } from "./pose-clip.ts";

/** A key pose further than this from every template pose (degrees, largest joint) keeps a neutral name. */
export const NAME_NEAR_DEG = 30;

export function nameKeyPoses(input: {
  poses: PoseAngles[];
  /** The capture frame each key pose was read from. */
  frames: number[];
  rig: Rig;
  /** The exercise's template poses and their names, or null when it has none. */
  reference: { poses: PoseAngles[]; labels: string[] | null } | null;
  near?: number;
}): string[] {
  const { poses, frames, rig, reference } = input;
  const near = input.near ?? NAME_NEAR_DEG;
  const fallback = poses.map((_, i) => (i === 0 ? "start" : `frame ${frames[i] ?? i}`));
  const labels = reference?.labels;
  if (!reference || !labels || labels.length !== reference.poses.length || !reference.poses.length) return fallback;
  const keyDeltas = poses.map((p) => characterDeltas(p, rig));
  const refDeltas = reference.poses.map((p) => characterDeltas(p, rig));
  const distance = keyDeltas.map((k) => refDeltas.map((r) => bodyDifference(k, r)));
  const names: (string | null)[] = poses.map(() => null);
  // Each template pose names its closest key pose, the clearest matches first.
  const pairs = distance.flatMap((row, i) => row.map((d, j) => ({ i, j, d }))).filter((p) => p.d <= near).sort((a, b) => a.d - b.d);
  const usedLabel = new Set<number>();
  for (const { i, j } of pairs) {
    if (names[i] !== null || usedLabel.has(j)) continue;
    names[i] = labels[j];
    usedLabel.add(j);
  }
  // In between: toward the next named key pose (a loop comes back to the first one).
  return names.map((name, i) => {
    if (name) return name;
    const next = names.slice(i + 1).find(Boolean) ?? names.find(Boolean);
    return next && next !== names[i - 1] ? `toward ${next}` : fallback[i];
  });
}
