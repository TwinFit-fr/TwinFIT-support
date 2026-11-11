"use client";

import { useCallback, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { draftParams } from "@/lib/studio/draft-params";
import { guardOf, replacedOf, useDragModeStore } from "@/lib/studio/drag-mode";
import type { TemplateExercise, TemplateParams } from "@/lib/studio/exercise-templates";
import { rebuildToast, type Replaced } from "@/lib/studio/rebuild-words";
import { useStudioStore } from "@/lib/studio/store";
import { templateDraft, templateExerciseOf } from "@/lib/studio/template-draft";
import type { StudioExercise } from "@/lib/studio/types";
import { normalizeParams, settingChange } from "@/lib/studio/template-settings";

export type SettingsApplied = {
  /** The poses were rebuilt (false: these settings are already what is on the stage). */
  changed: boolean;
  /** What the rebuild replaced besides the template's own poses: manual edits, a saved clip's poses (undo brings them back). */
  replaced: Replaced;
  /** What changed, in words for the stage ("Range: deep"). */
  change: string | null;
  /** Nothing was rebuilt: the poses are a saved clip the user has not agreed to rebuild (rebuild-guard.ts). */
  blocked?: boolean;
};

/**
 * Rebuild every pose of the editor from the exercise's template with these settings: one undo
 * step, no language model, nothing to wait for. The pose being edited stays selected (or
 * `keyframe`, for a drag that moved to another pose). Used by the settings controls and by a drag
 * in Exercise mode on the stage.
 */
export function applyTemplateSettings(exercise: TemplateExercise, params: TemplateParams, keyframe?: number): SettingsApplied {
  const state = useStudioStore.getState();
  const edit = state.poseEdit;
  if (!edit) return { changed: false, replaced: null, change: null };
  if (guardOf(edit, exercise, useDragModeStore.getState().agreed).locked) return { changed: false, replaced: null, change: null, blocked: true };
  const from = normalizeParams(exercise, draftParams(exercise, edit));
  const next = normalizeParams(exercise, params);
  const replaced = replacedOf(edit, exercise);
  const change = settingChange(from, next);
  if (!change && !replaced && edit.origin.kind === "template") return { changed: false, replaced: null, change: null };
  const draft = templateDraft(exercise, next);
  state.replacePoses({
    poses: draft.poses,
    labels: draft.labels,
    weights: draft.weights,
    mode: draft.mode,
    grip: draft.grip,
    twoHanded: draft.twoHanded,
    meta: draft.meta,
    origin: draft.origin,
    keyframe: keyframe ?? edit.keyframe,
  });
  return { changed: true, replaced, change };
}

/** Says, with an Undo button, that a rebuild replaced manual edits or a clip's poses (a plain change needs no toast: the origin label says it). */
export function useRebuildNotice() {
  const toast = useToast();
  const undo = useStudioStore((s) => s.undoPose);
  return useCallback(
    (result: SettingsApplied) => {
      const text = result.changed ? rebuildToast(result.replaced, result.change) : null;
      if (text) toast.success(text, "Poses rebuilt", { label: "Undo", onClick: undo });
    },
    [toast, undo],
  );
}

/** Keeps the selected exercise, as its template reads it, where the settings and the stage find it. */
export function useTemplateExerciseSync(exercise: StudioExercise | null) {
  const setExercise = useDragModeStore((s) => s.setExercise);
  useEffect(() => {
    setExercise(exercise?.id ?? null, exercise ? templateExerciseOf(exercise) : null);
  }, [exercise, setExercise]);
}
