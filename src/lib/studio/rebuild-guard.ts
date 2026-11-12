/**
 * Saved work is not rebuilt from the template by accident. A saved clip whose poses are not what
 * its template settings build (tuned by hand, or written by the AI as angles), and key poses read
 * from a motion capture, are locked: a setting change or a drag in Exercise mode does not rebuild
 * them until the user has agreed once for that clip or capture, in a confirm that names what will
 * be replaced. Until then the stage drags limbs. Pure.
 */

import type { DraftOrigin } from "./pose-origin.ts";
import type { Replaced } from "./rebuild-words.ts";

export type ClipGuard =
  | { locked: false }
  | {
      locked: true;
      /** What the poses come from: a saved pose clip, or a capture row they were read from. */
      source: "clip" | "capture";
      vectorId: string;
      seq: number | null;
      /** How many poses a rebuild would replace. */
      poses: number;
    };

/**
 * Locked: the poses come from a saved clip or a capture, a rebuild would replace something, and
 * the user has not agreed for that clip or capture.
 */
export function clipGuard(origin: DraftOrigin, replaced: Replaced, poses: number, agreed: readonly string[]): ClipGuard {
  if ((origin.kind !== "clip" && origin.kind !== "capture") || replaced === null || agreed.includes(origin.vectorId)) return { locked: false };
  return { locked: true, source: origin.kind, vectorId: origin.vectorId, seq: origin.seq, poses };
}

type Locked = Extract<ClipGuard, { locked: true }>;
const clipName = (g: Locked) => (g.source === "capture" ? (g.seq !== null ? `capture #${g.seq}` : "the capture") : g.seq !== null ? `clip #${g.seq}` : "this clip");
const savedName = (g: Locked) => (g.source === "capture" ? clipName(g) : g.seq !== null ? `saved clip #${g.seq}` : "this saved clip");
const posesOf = (g: Locked) => `${g.poses} ${g.source === "capture" ? "key " : ""}pose${g.poses === 1 ? "" : "s"}`;
const capitalised = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** Under the settings while the clip (or the capture's key poses) is locked. */
export function guardNotice(g: Locked): string {
  if (g.source === "capture") {
    return `These ${posesOf(g)} were read from ${clipName(g)}, not built from these settings. Settings and Exercise drags are paused so they stay as they are.`;
  }
  return `${capitalised(savedName(g))} has poses these settings do not build. Settings and Exercise drags are paused so its ${posesOf(g)} stay as they are.`;
}

/** The inline confirm before the first rebuild of a locked clip; `change` is the setting being changed, null for a plain rebuild. */
export function guardQuestion(change: string | null): string {
  return change ? `Rebuild every pose from the template with ${change}?` : "Rebuild every pose from the template with these settings?";
}

export function guardConsequence(g: Locked): string {
  if (g.source === "capture") return `This replaces the ${posesOf(g)} read from ${clipName(g)} with the template's poses (${clipName(g)} itself stays as it is; Ctrl+Z brings the key poses back).`;
  return `This replaces the ${posesOf(g)} of ${savedName(g)} in the editor (the stored clip changes only when you save; Ctrl+Z brings them back).`;
}

/** On the stage, when Exercise mode is picked on a locked clip. */
export function guardDragQuestion(g: Locked): string {
  return `Exercise drags rebuild every pose from the template, replacing the ${posesOf(g)} ${g.source === "capture" ? "read from" : "of"} ${clipName(g)}.`;
}

/** The safe answer of the confirm: keep what is there. */
export function guardKeepLabel(g: Locked): string {
  return g.source === "capture" ? "Keep the key poses" : "Keep the clip";
}
