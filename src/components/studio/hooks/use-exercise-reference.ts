"use client";

import { useMemo } from "react";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import { referenceOf, type ExerciseReference, type ReferenceResponse } from "@/lib/studio/exercise-reference";
import { useStudioStore } from "@/lib/studio/store";
import { STUDIO_AVATARS_KEY, STUDIO_EXERCISES_KEY, exerciseReferenceKey } from "@/lib/studio/studio-api";
import type { BaseAvatar, StudioExercise } from "@/lib/studio/types";

/**
 * The open exercise's catalog reference for the avatar on the stage (its subject picks the man or
 * woman frames, as the AI draft does). Catalog and avatars come from the workspace's own caches;
 * the reference is read once per exercise and subject.
 */
export function useExerciseReference(): {
  exercise: StudioExercise | null;
  reference: ExerciseReference | null;
  loading: boolean;
  error: unknown;
  retry: () => void;
} {
  const exerciseId = useStudioStore((s) => s.exerciseId);
  const avatarId = useStudioStore((s) => s.scene.avatarId);
  const { data: catalog } = useStaffSWR<{ exercises: StudioExercise[] }>(STUDIO_EXERCISES_KEY);
  const { data: avatars } = useStaffSWR<{ avatars: BaseAvatar[] }>(STUDIO_AVATARS_KEY);
  const exercise = useMemo(() => catalog?.exercises.find((e) => e.id === exerciseId) ?? null, [catalog, exerciseId]);
  const subject = avatars?.avatars.find((a) => a.id === avatarId)?.subject === "woman" ? "woman" : "man";
  const key = exercise ? exerciseReferenceKey(exercise.exo_id, subject) : null;
  const { data, error, isLoading, mutate } = useStaffSWR<ReferenceResponse>(key, { keepPreviousData: false, dedupingInterval: 60_000 });
  const reference = useMemo(() => (data ? referenceOf(data) : null), [data]);
  return { exercise, reference, loading: Boolean(key) && isLoading, error, retry: () => void mutate() };
}
