"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAccessToken } from "@nhost/react";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import { setStudioAccessToken } from "@/lib/studio/asset-auth";
import { EQUIPMENT_KEY, equipmentKey, placementOf, type EquipmentResponse } from "@/lib/studio/equipment";
import { avatarsPollMs, equipmentPollMs, vectorsPollMs } from "@/lib/studio/jobs";
import { loadState, stageState } from "@/lib/studio/load-state";
import { EMPTY_SCENE, useStudioStore, type SceneSource } from "@/lib/studio/store";
import { studioAssetUrl } from "@/lib/studio/storage-url";
import type { ActiveEquipmentModels, BaseAvatar, MovementVector, StudioExercise, StudioSettings } from "@/lib/studio/types";

/** The scene slice for an avatar and the clip the viewer should play. URLs come from the file ids (stable across environments). */
function sceneFor(avatar: BaseAvatar | null, vector: MovementVector | null): SceneSource {
  const modelUrl = avatar ? studioAssetUrl(avatar.file_id, avatar.model_url) : null;
  if (!avatar || !modelUrl) return EMPTY_SCENE;
  const ready = vector?.status === "ready";
  return {
    avatarId: avatar.id,
    avatarName: avatar.name,
    rig: avatar.rig,
    modelUrl,
    heightM: avatar.height_m,
    sockets: avatar.sockets,
    vectorId: vector?.id ?? null,
    vectorSeq: vector?.seq ?? null,
    vectorStatus: vector?.status ?? null,
    vectorFps: vector?.fps ?? null,
    clipUrl: ready ? studioAssetUrl(vector.file_id, vector.vector_url) : null,
    clipFormat: ready ? vector.format : null,
  };
}

/**
 * Everything the workspace loads (catalog, avatars, settings, equipment, the selected exercise's
 * vectors) and the derived selection, pushed into the store slices the canvas reads.
 */
export function useStudioData() {
  const token = useAccessToken();
  const searchParams = useSearchParams();
  const exerciseId = useStudioStore((s) => s.exerciseId);
  const avatarId = useStudioStore((s) => s.avatarId);
  const vectorId = useStudioStore((s) => s.vectorId);
  const selectExercise = useStudioStore((s) => s.selectExercise);
  const setAvatar = useStudioStore((s) => s.setAvatar);
  const setScene = useStudioStore((s) => s.setScene);
  const setEquipmentModels = useStudioStore((s) => s.setEquipmentModels);

  // The bucket is staff-only: loaders read the current token from here.
  useEffect(() => {
    setStudioAccessToken(token ?? null);
    return () => setStudioAccessToken(null);
  }, [token]);

  const { data: catalog, error: catalogError, mutate: mutateCatalog } = useStaffSWR<{ exercises: StudioExercise[] }>("/api/studio/exercises");
  // The workspace is where background jobs advance, whatever dialog is open or closed: the avatars
  // and equipment list routes advance their Meshy jobs, so each list polls while one of its jobs runs.
  const { data: avatarData, error: avatarsError, mutate: mutateAvatars } = useStaffSWR<{ avatars: BaseAvatar[] }>("/api/studio/avatars", {
    refreshInterval: (latest) => avatarsPollMs(latest?.avatars),
  });
  const { data: settingsData, error: settingsError, mutate: mutateSettings } = useStaffSWR<{ settings: StudioSettings }>("/api/studio/settings");
  // Same key as the equipment dialog: one cache, and this one poll (the dialog has none of its own).
  const { data: equipmentData, mutate: mutateEquipment } = useStaffSWR<EquipmentResponse>(EQUIPMENT_KEY, {
    refreshInterval: (latest) => equipmentPollMs(latest?.equipment),
  });

  const exercises = useMemo(() => catalog?.exercises ?? [], [catalog]);
  const avatars = useMemo(() => avatarData?.avatars ?? [], [avatarData]);
  const settings = settingsData?.settings ?? null;

  const exercise = useMemo(() => exercises.find((e) => e.id === exerciseId) ?? null, [exercises, exerciseId]);
  const avatar = useMemo(() => {
    const chosen = avatars.find((a) => a.id === avatarId);
    if (chosen?.status === "ready") return chosen;
    const ready = avatars.filter((a) => a.status === "ready");
    return ready.find((a) => a.is_default) ?? ready[0] ?? null;
  }, [avatars, avatarId]);

  const {
    data: vectorData,
    error: vectorsError,
    isLoading: vectorsLoading,
    mutate: mutateVectors,
  } = useStaffSWR<{ vectors: MovementVector[] }>(exerciseId ? `/api/studio/vectors?exercise=${exerciseId}` : null, {
    refreshInterval: (latest) => vectorsPollMs(latest?.vectors),
    // Another exercise's rows are never this one's answer: while the new list loads (or fails) there is none.
    keepPreviousData: false,
  });
  // The fetcher keeps the previous key's data while the next loads: rows of another exercise are not this one's.
  const vectors = useMemo(() => (vectorData?.vectors ?? []).filter((v) => v.exercise_id === exerciseId), [vectorData, exerciseId]);

  // The clip the viewer plays: the chosen one, else the active ready clip of this avatar, else the latest ready.
  const vector = useMemo(() => {
    const chosen = vectors.find((v) => v.id === vectorId);
    if (chosen) return chosen;
    const ready = vectors.filter((v) => v.status === "ready" && (!avatar || v.avatar_id === avatar.id));
    return ready.find((v) => v.active) ?? ready[0] ?? null;
  }, [vectors, vectorId, avatar]);

  // The canvas reads only this slice; setScene ignores a call whose values did not change.
  useEffect(() => {
    setScene(sceneFor(avatar, vector));
  }, [avatar, vector, setScene]);

  // The model in use per code, for the viewer (same identity rule: only a real change reaches the canvas).
  useEffect(() => {
    const models: ActiveEquipmentModels = {};
    for (const entry of equipmentData?.equipment ?? []) {
      const active = entry.models.find((m) => m.active && m.status === "ready" && (m.file_id || m.model_url));
      const url = active ? studioAssetUrl(active.file_id, active.model_url) : null;
      if (active && url) {
        models[equipmentKey(entry.kind, entry.code)] = { id: active.id, url, placement: placementOf(entry.kind, active.params) };
      }
    }
    setEquipmentModels(models);
  }, [equipmentData, setEquipmentModels]);

  // Deep link: /studio?exo=12 selects that exercise once the catalog is in; selection writes it back.
  useEffect(() => {
    if (exerciseId || !exercises.length) return;
    const exo = Number(searchParams.get("exo"));
    const match = exo ? exercises.find((e) => e.exo_id === exo) : null;
    if (match) selectExercise(match.id);
  }, [exercises, exerciseId, searchParams, selectExercise]);
  useEffect(() => {
    if (!exercise) return;
    const url = new URL(window.location.href);
    url.searchParams.set("exo", String(exercise.exo_id));
    window.history.replaceState(null, "", url);
  }, [exercise]);

  useEffect(() => {
    if (!avatarId && avatar) setAvatar(avatar.id);
  }, [avatarId, avatar, setAvatar]);

  // A generated avatar that arrives never replaces the one on the stage: the jobs tray announces
  // it and offers "Use this avatar", which goes through the unsaved-work guard.

  const equipmentCodes = useMemo(
    () => [...new Set(exercises.map((e) => e.equipment?.code).filter((c): c is string => Boolean(c) && c !== "NONE"))].sort(),
    [exercises],
  );
  const supportCodes = useMemo(
    () => [...new Set(exercises.map((e) => e.support_equipment?.code).filter((c): c is string => Boolean(c)))].sort(),
    [exercises],
  );
  // Loading, failed, empty or ready per source: the panes say which instead of showing an empty list.
  const catalogState = loadState({ data: catalog, error: catalogError }, (d) => d.exercises.length === 0);
  const avatarsState = loadState({ data: avatarData, error: avatarsError }, (d) => d.avatars.length === 0);
  const settingsState = loadState({ data: settingsData, error: settingsError }, () => false);
  const vectorsState = loadState({ data: vectorData, error: vectorsError }, (d) => d.vectors.length === 0);
  const stage = useMemo(() => stageState(avatarsState, avatars), [avatarsState, avatars]);

  /** Rows queued anywhere in the catalog (pending + processing): what keeps the worker ticking. */
  const queuedAnywhere = useMemo(() => exercises.reduce((n, e) => n + e.vectors.queued, 0), [exercises]);

  return {
    exercises,
    avatars,
    settings,
    equipment: equipmentData?.equipment ?? [],
    /** The equipment list has answered (the jobs tray announces nothing before every list is in). */
    equipmentLoaded: equipmentData !== undefined,
    vectors,
    /** The selected exercise's clips have arrived (an empty list is an answer too). */
    vectorsLoaded: vectorData !== undefined && !vectorsLoading,
    exercise,
    avatar,
    vector,
    catalogState,
    catalogError,
    avatarsState,
    avatarsError,
    settingsState,
    vectorsState,
    vectorsError,
    /** What the stage shows before it can draw an avatar (loading, failed, first run, a build). */
    stage,
    vectorsLoading,
    equipmentCodes,
    supportCodes,
    queuedAnywhere,
    mutateCatalog,
    mutateAvatars,
    mutateSettings,
    mutateEquipment,
    mutateVectors,
  };
}

export type StudioData = ReturnType<typeof useStudioData>;
