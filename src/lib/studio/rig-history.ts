/**
 * Undo and redo of the rig editor: what one step restores is the whole unsaved rig (the socket
 * draft and the placement drafts) plus the point that was selected, so undoing a move also puts
 * the selection back on the point that moved. A drag (pointer, gizmo, held arrow key) is one
 * step: its first edit opens a gesture and the rest share it until the gesture ends, the same way
 * the pose editor folds a drag. Pure functions over plain data, for node:test.
 */

import type { AvatarSocket, EquipmentPlacement } from "./types";

/** Sockets being edited, bound to the avatar they were taken from: a draft never lands on another avatar. */
export type SocketDraft = { avatarId: string; sockets: AvatarSocket[] };

/** Everything unsaved in the rig editor, as one value. `sockets` null: the avatar's saved sockets are untouched. */
export type RigSnapshot = {
  sockets: SocketDraft | null;
  placements: Record<string, EquipmentPlacement>;
  /** The point selected when this state was current (a socket id or an equipment key), restored with it. */
  target: string | null;
};

/** One remembered state and what the edit that left it did ("Moved Left hand"), for the announcement on undo. */
export type RigStep = { snapshot: RigSnapshot; label: string };

export type RigHistory = {
  /** Undo stack, newest last. */
  past: RigStep[];
  /** Redo stack, newest first. */
  future: RigStep[];
  /** A drag is in progress: its edits share the step its first edit opened. */
  gestureOpen: boolean;
};

export const RIG_HISTORY_LIMIT = 80;

export const EMPTY_RIG_HISTORY: RigHistory = { past: [], future: [], gestureOpen: false };

/**
 * The history after an edit made from `before`. Inside an open gesture the edit joins the step
 * already pushed; otherwise `before` is pushed. Any edit clears the redo stack. `gesture` says
 * whether this edit opens (or continues) a drag.
 */
export function recordRig(history: RigHistory, before: RigSnapshot, label: string, gesture = false): RigHistory {
  if (gesture && history.gestureOpen) return history.future.length ? { ...history, future: [] } : history;
  const past = [...history.past, { snapshot: before, label }].slice(-RIG_HISTORY_LIMIT);
  return { past, future: [], gestureOpen: gesture };
}

/** The drag is over: the next edit opens a new step. */
export function endRigGesture(history: RigHistory): RigHistory {
  return history.gestureOpen ? { ...history, gestureOpen: false } : history;
}

/** Step back from `current`: the state to restore, what was undone, and the history after it; null with nothing to undo. */
export function undoRig(history: RigHistory, current: RigSnapshot): { snapshot: RigSnapshot; label: string; history: RigHistory } | null {
  const step = history.past[history.past.length - 1];
  if (!step) return null;
  return {
    snapshot: step.snapshot,
    label: step.label,
    history: {
      past: history.past.slice(0, -1),
      future: [{ snapshot: current, label: step.label }, ...history.future].slice(0, RIG_HISTORY_LIMIT),
      gestureOpen: false,
    },
  };
}

/** Step forward again from `current`; null with nothing to redo. */
export function redoRig(history: RigHistory, current: RigSnapshot): { snapshot: RigSnapshot; label: string; history: RigHistory } | null {
  const [step, ...future] = history.future;
  if (!step) return null;
  return {
    snapshot: step.snapshot,
    label: step.label,
    history: {
      past: [...history.past, { snapshot: current, label: step.label }].slice(-RIG_HISTORY_LIMIT),
      future,
      gestureOpen: false,
    },
  };
}

/** Is anything unsaved in this state? */
export function rigDirty(snapshot: Pick<RigSnapshot, "sockets" | "placements">): boolean {
  return snapshot.sockets !== null || Object.keys(snapshot.placements).length > 0;
}
