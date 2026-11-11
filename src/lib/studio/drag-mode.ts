"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { hasManualEdits } from "./draft-params.ts";
import type { TemplateExercise } from "./exercise-templates.ts";
import { effectiveDragMode, replacedBy, type DragMode, type Replaced } from "./rebuild-words.ts";
import { hasTemplate } from "./template-draft.ts";
import { settingsFor } from "./template-settings.ts";
import { useStudioStore, type PoseEditState } from "./store.ts";

/**
 * What a drag of a body point on the stage does. "exercise": the template's settings follow the
 * pointer and every pose is rebuilt (pose-drag for the limb is not used). "limb": the dragged limb
 * moves on its own (pose-drag.ts). The user's choice holds for the exercise it was made on; until
 * then it is Exercise when the exercise has settings to drag and the poses hold no edits made by hand.
 */
export type { DragMode } from "./rebuild-words.ts";

type DragModeState = {
  /** The selected exercise, as its template reads it (null: none, or not loaded yet). */
  exerciseId: string | null;
  exercise: TemplateExercise | null;
  /** What the user picked for this exercise; null until they pick. */
  choice: DragMode | null;
  setExercise: (exerciseId: string | null, exercise: TemplateExercise | null) => void;
  setChoice: (choice: DragMode) => void;
};

export const useDragModeStore = create<DragModeState>((set) => ({
  exerciseId: null,
  exercise: null,
  choice: null,
  setExercise: (exerciseId, exercise) =>
    set((s) => (s.exerciseId === exerciseId && s.exercise?.name === exercise?.name ? s : { exerciseId, exercise, choice: s.exerciseId === exerciseId ? s.choice : null })),
  setChoice: (choice) => set({ choice }),
}));

/** The exercise's settings can be dragged: it has a template with at least one setting that moves the body. */
export function canDragSettings(exercise: TemplateExercise | null): exercise is TemplateExercise {
  return Boolean(exercise && hasTemplate(exercise) && settingsFor(exercise).length > 0);
}

type EditLike = Pick<PoseEditState, "poses" | "meta" | "weights" | "origin" | "edited">;

export type DragModeNow = {
  mode: DragMode;
  draggable: boolean;
  /** The poses are not what the template builds for their settings: a rebuild replaces something. */
  manualEdits: boolean;
  /** What a rebuild would replace, in the words the editor uses (null: nothing). */
  replaced: Replaced;
  exercise: TemplateExercise | null;
};

const editsSeen = new WeakMap<object, { exercise: TemplateExercise; meta: unknown; value: boolean }>();

/** Whether a rebuild from the template would replace something in the editor's poses, worked out once per poses object (selectors call it on every store change). */
export function manualEditsOf(edit: Pick<PoseEditState, "poses" | "meta" | "weights"> | null, exercise: TemplateExercise | null): boolean {
  if (!edit || !exercise || !hasTemplate(exercise)) return false;
  const seen = editsSeen.get(edit.poses);
  if (seen && seen.exercise === exercise && seen.meta === edit.meta) return seen.value;
  const value = hasManualEdits(edit, exercise);
  editsSeen.set(edit.poses, { exercise, meta: edit.meta, value });
  return value;
}

/** What a rebuild of the editor's poses would replace. */
export function replacedOf(edit: EditLike | null, exercise: TemplateExercise | null): Replaced {
  return edit ? replacedBy(edit.origin, edit.edited, manualEditsOf(edit, exercise)) : null;
}

/** The drag mode for the editor's poses now (read once: the stage calls it when a drag starts). */
export function dragModeNow(edit: EditLike | null = useStudioStore.getState().poseEdit): DragModeNow {
  const { exercise, choice } = useDragModeStore.getState();
  const draggable = canDragSettings(exercise);
  const replaced = replacedOf(edit, exercise);
  return { mode: effectiveDragMode(choice, draggable, replaced), draggable, manualEdits: replaced !== null, replaced, exercise };
}

/** The same, kept current for a component: it re-renders only when the mode, or what a rebuild replaces, changes. */
export function useDragMode(): DragModeNow & { setChoice: (choice: DragMode) => void } {
  const exercise = useDragModeStore((s) => s.exercise);
  const choice = useDragModeStore((s) => s.choice);
  const setChoice = useDragModeStore((s) => s.setChoice);
  const replaced = useStudioStore((s) => replacedOf(s.poseEdit, exercise));
  const draggable = useMemo(() => canDragSettings(exercise), [exercise]);
  return { mode: effectiveDragMode(choice, draggable, replaced), draggable, manualEdits: replaced !== null, replaced, exercise, setChoice };
}
