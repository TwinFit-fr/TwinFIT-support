"use client";

import { useEffect, useMemo, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import { landingPlan, type LandingPlan } from "@/lib/studio/landing";
import { defaultEquipmentItems } from "@/lib/studio/prompt";
import { useStudioStore } from "@/lib/studio/store";
import { defaultDraft, templateExerciseOf } from "@/lib/studio/template-draft";
import type { BaseAvatar, EquipmentItem, MovementVector, StudioExercise } from "@/lib/studio/types";
import type { PoseDraft } from "@/lib/studio/template-draft";
import { problemOf, useClipProblems } from "./use-clip-problems";

/**
 * Picking an exercise lands on editable poses: its saved pose clip opens in the editor, else
 * the exercise's template is built on the spot (no model, no queue). It runs again whenever the
 * editor is empty while the Poses tab shows (after a revert, or another avatar), so the stage
 * always holds something to adjust. A clip that turns out not to hold poses is not replaced by the
 * template behind the user's back: the pane says so (use-clip-problems.ts). Returns the plan, for
 * the pane to say what it is opening.
 */
export function useExerciseLanding(input: {
  exercise: StudioExercise | null;
  avatar: BaseAvatar | null;
  vectors: MovementVector[];
  vectorsLoaded: boolean;
  active: boolean;
  onEditPoses: (vector: MovementVector) => Promise<void>;
  onOpenDraft: (draft: PoseDraft, items: EquipmentItem[]) => void;
}): LandingPlan<MovementVector> | null {
  const { exercise, avatar, vectors, vectorsLoaded, active, onEditPoses, onOpenDraft } = input;
  const toast = useToast();
  // A draft of another exercise or avatar (left for a moment by a selection change) does not count.
  const draftFor = useStudioStore((s) => (s.poseEdit ? `${s.poseEdit.exerciseId}:${s.poseEdit.avatarId}` : null));
  const hasDraft = Boolean(exercise && avatar && draftFor === `${exercise.id}:${avatar.id}`);
  const preferredId = useStudioStore((s) => s.vectorId);
  const opening = useRef<string | null>(null);
  // Clips found not to hold poses, or not to load, are shown as they are instead of opened again.
  const problemList = useClipProblems((s) => s.problems);
  const problems = useMemo(() => Object.fromEntries(vectors.filter((v) => problemOf(problemList, v)).map((v) => [v.id, true])), [vectors, problemList]);

  const plan = useMemo(
    () =>
      exercise && avatar
        ? landingPlan({ readyCount: exercise.vectors.ready, vectors: vectorsLoaded ? vectors : null, avatarId: avatar.id, preferredId, problems })
        : null,
    [exercise, avatar, vectors, vectorsLoaded, preferredId, problems],
  );

  useEffect(() => {
    if (!exercise || !avatar || !plan || hasDraft || !active) return;
    const openDraft = () => onOpenDraft(defaultDraft(templateExerciseOf(exercise)), defaultEquipmentItems(exercise, avatar.sockets));
    if (plan.kind === "draft") openDraft();
    if (plan.kind !== "edit") return;
    const key = `${exercise.id}:${avatar.id}:${plan.vector.id}`;
    if (opening.current === key) return;
    opening.current = key;
    onEditPoses(plan.vector)
      .catch((err: unknown) => {
        // A problem with the clip itself is said in the Poses tab, which now shows the clip as it is.
        if (problemOf(useClipProblems.getState().problems, plan.vector)) return;
        toast.error(err instanceof Error ? err.message : "Could not open the clip", `Clip #${plan.vector.seq}`);
        const now = useStudioStore.getState();
        if (now.exerciseId === exercise.id && now.poseEdit?.exerciseId !== exercise.id) openDraft();
      })
      .finally(() => {
        if (opening.current === key) opening.current = null;
      });
  }, [exercise, avatar, plan, hasDraft, active, onEditPoses, onOpenDraft, toast]);

  return plan;
}
