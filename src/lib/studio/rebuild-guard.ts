/**
 * Saved work is not rebuilt from the template by accident. A saved clip whose poses are not what
 * its template settings build (tuned by hand, or written by the AI as angles) is locked: a setting
 * change or a drag in Exercise mode does not rebuild it until the user has agreed once for that
 * clip, in a confirm that names what will be replaced. Until then the stage drags limbs. Pure.
 */

import type { DraftOrigin } from "./pose-origin.ts";
import type { Replaced } from "./rebuild-words.ts";

export type ClipGuard =
  | { locked: false }
  | {
      locked: true;
      vectorId: string;
      seq: number | null;
      /** How many poses a rebuild would replace. */
      poses: number;
    };

/** Locked: the poses come from a saved clip, a rebuild would replace something, and the user has not agreed for that clip. */
export function clipGuard(origin: DraftOrigin, replaced: Replaced, poses: number, agreed: readonly string[]): ClipGuard {
  if (origin.kind !== "clip" || replaced === null || agreed.includes(origin.vectorId)) return { locked: false };
  return { locked: true, vectorId: origin.vectorId, seq: origin.seq, poses };
}

const clipName = (g: Extract<ClipGuard, { locked: true }>) => (g.seq !== null ? `clip #${g.seq}` : "this clip");
const savedName = (g: Extract<ClipGuard, { locked: true }>) => (g.seq !== null ? `saved clip #${g.seq}` : "this saved clip");
const posesOf = (g: Extract<ClipGuard, { locked: true }>) => `${g.poses} pose${g.poses === 1 ? "" : "s"}`;

/** Under the settings while the clip is locked. */
export function guardNotice(g: Extract<ClipGuard, { locked: true }>): string {
  const name = savedName(g);
  return `${name[0].toUpperCase()}${name.slice(1)} has poses these settings do not build. Settings and Exercise drags are paused so its ${posesOf(g)} stay as they are.`;
}

/** The inline confirm before the first rebuild of a locked clip; `change` is the setting being changed, null for a plain rebuild. */
export function guardQuestion(change: string | null): string {
  return change ? `Rebuild every pose from the template with ${change}?` : "Rebuild every pose from the template with these settings?";
}

export function guardConsequence(g: Extract<ClipGuard, { locked: true }>): string {
  return `This replaces the ${posesOf(g)} of ${savedName(g)} in the editor (the stored clip changes only when you save; Ctrl+Z brings them back).`;
}

/** On the stage, when Exercise mode is picked on a locked clip. */
export function guardDragQuestion(g: Extract<ClipGuard, { locked: true }>): string {
  return `Exercise drags rebuild every pose from the template, replacing the ${posesOf(g)} of ${clipName(g)}.`;
}
