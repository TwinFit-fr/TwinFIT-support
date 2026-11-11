"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAccessToken } from "@nhost/react";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import { useToast } from "@/components/ui/toast";
import { setStudioAccessToken } from "@/lib/studio/asset-auth";
import { equipmentKey, placementOf } from "@/lib/studio/equipment";
import { EMPTY_SCENE, useStudioStore, type SceneSource } from "@/lib/studio/store";
import { studioAssetUrl } from "@/lib/studio/storage-url";
import type { ActiveEquipmentModels, BaseAvatar, MovementVector, StudioExercise, StudioSettings } from "@/lib/studio/types";
import { isQueued } from "@/lib/studio/types";
import { EQUIPMENT_KEY, type EquipmentResponse } from "../equipment-dialog";

const QUEUE_POLL_MS = 3000;

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
  const toast = useToast();
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

  const { data: catalog, isLoading: catalogLoading, mutate: mutateCatalog } = useStaffSWR<{ exercises: StudioExercise[] }>("/api/studio/exercises");
  // Polls while an avatar is being generated: the list route advances the Meshy job.
  const { data: avatarData, mutate: mutateAvatars } = useStaffSWR<{ avatars: BaseAvatar[] }>("/api/studio/avatars", {
    refreshInterval: (latest) => (latest?.avatars.some((a) => a.status === "pending" || a.status === "processing") ? 5000 : 0),
  });
  const { data: settingsData, mutate: mutateSettings } = useStaffSWR<{ settings: StudioSettings }>("/api/studio/settings");
  // Same key as the equipment dialog: one cache, one poll while a Meshy task runs.
  const { data: equipmentData, mutate: mutateEquipment } = useStaffSWR<EquipmentResponse>(EQUIPMENT_KEY);

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
    isLoading: vectorsLoading,
    mutate: mutateVectors,
  } = useStaffSWR<{ vectors: MovementVector[] }>(exerciseId ? `/api/studio/vectors?exercise=${exerciseId}` : null, {
    refreshInterval: (latest) => (latest?.vectors.some((v) => isQueued(v.status)) ? QUEUE_POLL_MS : 0),
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

  // Tell the user when a generated avatar arrives (or fails) and switch to it.
  const seenStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const a of avatars) {
      const before = seenStatus.current[a.id];
      seenStatus.current[a.id] = a.status;
      if (!before || before === a.status || a.provider !== "meshy") continue;
      if (a.status === "ready") {
        toast.success(`${a.name} is ready (${Object.keys((a.params?.bones as object) ?? {}).length} bones recognised)`, "Avatar generated");
        setAvatar(a.id);
      } else if (a.status === "error") {
        toast.error(a.error ?? "Generation failed", `${a.name} failed`);
      }
    }
  }, [avatars, toast, setAvatar]);

  const equipmentCodes = useMemo(
    () => [...new Set(exercises.map((e) => e.equipment?.code).filter((c): c is string => Boolean(c) && c !== "NONE"))].sort(),
    [exercises],
  );
  const supportCodes = useMemo(
    () => [...new Set(exercises.map((e) => e.support_equipment?.code).filter((c): c is string => Boolean(c)))].sort(),
    [exercises],
  );
  /** Rows queued anywhere in the catalog (pending + processing): what keeps the worker ticking. */
  const queuedAnywhere = useMemo(() => exercises.reduce((n, e) => n + e.vectors.queued, 0), [exercises]);

  return {
    exercises,
    avatars,
    settings,
    equipment: equipmentData?.equipment ?? [],
    vectors,
    /** The selected exercise's clips have arrived (an empty list is an answer too). */
    vectorsLoaded: vectorData !== undefined && !vectorsLoading,
    exercise,
    avatar,
    vector,
    catalogLoading,
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
