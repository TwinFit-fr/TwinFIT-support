"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccessToken } from "@nhost/react";
import { ChevronDown, Dumbbell, Plus } from "lucide-react";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { equipmentKey, placementOf } from "@/lib/studio/equipment";
import { EMPTY_SCENE, useStudioStore, type SceneSource } from "@/lib/studio/store";
import type { ActiveEquipmentModels, BaseAvatar, MovementVector, StudioExercise, StudioSettings } from "@/lib/studio/types";
import { isQueued } from "@/lib/studio/types";
import { AvatarDialog } from "./avatar-dialog";
import { EQUIPMENT_KEY, EquipmentDialog, type EquipmentResponse } from "./equipment-dialog";
import { CatalogSidebar } from "./catalog-sidebar";
import { InspectorPanel, type GenerateInput, type VectorAction } from "./inspector-panel";
import { StudioShell } from "./studio-shell";
import { M3Button } from "./ui";
import { StudioViewport } from "./viewer/studio-viewport";

const QUEUE_POLL_MS = 3000;

function AvatarMenu({
  avatars,
  selected,
  onSelect,
  onUpload,
}: {
  avatars: BaseAvatar[];
  selected: BaseAvatar | null;
  onSelect: (id: string) => void;
  onUpload: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={selected?.id ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Base avatar"
          className="studio-state h-8 cursor-pointer appearance-none rounded-full border border-(--m3-outline-variant) bg-(--m3-surface-container-high) pl-3 pr-8 text-xs text-(--m3-on-surface) outline-none focus-visible:border-(--m3-primary)"
        >
          {!avatars.length ? <option value="">No avatar</option> : null}
          {avatars.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.subject} · {a.rig}
              {a.is_default ? " · default" : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--m3-on-surface-variant)" />
      </div>
      <M3Button size="sm" variant="outlined" onClick={onUpload}>
        <Plus className="h-3.5 w-3.5" /> Avatar
      </M3Button>
    </div>
  );
}

/** The scene slice for an avatar and the clip the viewer should play. */
function sceneFor(avatar: BaseAvatar | null, vector: MovementVector | null): SceneSource {
  if (!avatar) return EMPTY_SCENE;
  return {
    avatarId: avatar.id,
    avatarName: avatar.name,
    rig: avatar.rig,
    modelUrl: avatar.model_url,
    heightM: avatar.height_m,
    sockets: avatar.sockets,
    vectorId: vector?.id ?? null,
    vectorSeq: vector?.seq ?? null,
    vectorStatus: vector?.status ?? null,
    vectorFps: vector?.fps ?? null,
    clipUrl: vector?.status === "ready" ? vector.vector_url : null,
    clipFormat: vector?.status === "ready" ? vector.format : null,
  };
}

export function StudioWorkspace() {
  const staffFetch = useStaffFetch();
  const token = useAccessToken();
  const toast = useToast();
  const confirm = useConfirm();
  const searchParams = useSearchParams();

  const exerciseId = useStudioStore((s) => s.exerciseId);
  const avatarId = useStudioStore((s) => s.avatarId);
  const vectorId = useStudioStore((s) => s.vectorId);
  const selectExercise = useStudioStore((s) => s.selectExercise);
  const setAvatar = useStudioStore((s) => s.setAvatar);
  const setVector = useStudioStore((s) => s.setVector);
  const setScene = useStudioStore((s) => s.setScene);
  const setEquipmentModels = useStudioStore((s) => s.setEquipmentModels);

  const { data: catalog, isLoading: catalogLoading, mutate: mutateCatalog } = useStaffSWR<{
    exercises: StudioExercise[];
  }>("/api/studio/exercises");
  const { data: avatarData, mutate: mutateAvatars } = useStaffSWR<{ avatars: BaseAvatar[] }>(
    "/api/studio/avatars",
  );
  const { data: settingsData } = useStaffSWR<{ settings: StudioSettings }>("/api/studio/settings");
  // Same key as the equipment dialog: one cache, one poll while a Meshy task runs.
  const { data: equipmentData, mutate: mutateEquipment } = useStaffSWR<EquipmentResponse>(EQUIPMENT_KEY);

  const exercises = useMemo(() => catalog?.exercises ?? [], [catalog]);
  const avatars = useMemo(() => avatarData?.avatars ?? [], [avatarData]);
  const settings = settingsData?.settings ?? null;

  const exercise = useMemo(() => exercises.find((e) => e.id === exerciseId) ?? null, [exercises, exerciseId]);
  const avatar = useMemo(
    () => avatars.find((a) => a.id === avatarId) ?? avatars.find((a) => a.is_default) ?? avatars[0] ?? null,
    [avatars, avatarId],
  );

  const {
    data: vectorData,
    isLoading: vectorsLoading,
    mutate: mutateVectors,
  } = useStaffSWR<{ vectors: MovementVector[] }>(
    exerciseId ? `/api/studio/vectors?exercise=${exerciseId}` : null,
    {
      refreshInterval: (latest) => (latest?.vectors.some((v) => isQueued(v.status)) ? QUEUE_POLL_MS : 0),
    },
  );
  const vectors = useMemo(() => vectorData?.vectors ?? [], [vectorData]);

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
      const active = entry.models.find((m) => m.active && m.status === "ready" && m.model_url);
      if (active?.model_url) {
        models[equipmentKey(entry.kind, entry.code)] = { url: active.model_url, placement: placementOf(entry.kind, entry.code, active.params) };
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

  const [avatarDialog, setAvatarDialog] = useState(false);
  const [equipmentDialog, setEquipmentDialog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busyVectorId, setBusyVectorId] = useState<string | null>(null);

  const equipmentCodes = useMemo(
    () => [...new Set(exercises.map((e) => e.equipment?.code).filter((c): c is string => Boolean(c) && c !== "NONE"))].sort(),
    [exercises],
  );
  const supportCodes = useMemo(
    () => [...new Set(exercises.map((e) => e.support_equipment?.code).filter((c): c is string => Boolean(c)))].sort(),
    [exercises],
  );

  const refresh = useCallback(
    () => Promise.all([mutateVectors(), mutateCatalog()]),
    [mutateVectors, mutateCatalog],
  );

  const onGenerate = useCallback(
    async (input: GenerateInput) => {
      if (!exercise || !avatar) return;
      setGenerating(true);
      try {
        const body = (await staffFetch("/api/studio/vectors", {
          method: "POST",
          body: JSON.stringify({
            exercise_id: exercise.id,
            avatar_id: avatar.id,
            prompt: input.prompt,
            equipment: { items: input.items },
            params: input.params,
            format: input.format,
          }),
        })) as { vector: MovementVector };
        await refresh();
        setVector(body.vector.id);
        toast.success(`${exercise.display_name} queued as #${body.vector.seq}`, "Generation requested");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not enqueue the generation");
      } finally {
        setGenerating(false);
      }
    },
    [exercise, avatar, staffFetch, refresh, setVector, toast],
  );

  const onVectorAction = useCallback(
    async (target: MovementVector, action: VectorAction, file?: File) => {
      setBusyVectorId(target.id);
      try {
        if (action === "delete") {
          const ok = await confirm({
            title: `Delete movement #${target.seq}?`,
            description: "The row is removed from the queue and history. The clip file, if any, stays in Storage.",
            confirmLabel: "Delete",
            variant: "danger",
          });
          if (!ok) return;
          await staffFetch(`/api/studio/vectors/${target.id}`, { method: "DELETE" });
          if (vectorId === target.id) setVector(null);
          toast.success(`Movement #${target.seq} deleted`);
        } else if (action === "upload") {
          if (!file || !token) return;
          const form = new FormData();
          form.set("file", file);
          const res = await fetch(`/api/studio/vectors/${target.id}/result`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
          const body = (await res.json()) as { vector?: MovementVector; error?: string };
          if (!res.ok || !body.vector) throw new Error(body.error ?? `Upload failed (${res.status})`);
          setVector(body.vector.id);
          toast.success(`Clip attached to #${target.seq}`, "Movement ready");
        } else {
          await staffFetch(`/api/studio/vectors/${target.id}`, {
            method: "PATCH",
            body: JSON.stringify({ action }),
          });
          if (action === "activate") setVector(target.id);
          toast.success(
            action === "activate"
              ? `#${target.seq} is now the clip of this exercise`
              : action === "deactivate"
                ? `#${target.seq} is no longer active`
                : `#${target.seq} is back in the queue`,
          );
        }
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The action failed");
      } finally {
        setBusyVectorId(null);
      }
    },
    [confirm, staffFetch, token, vectorId, setVector, toast, refresh],
  );

  return (
    <>
      <StudioShell
        topbar={
          <div className="flex items-center gap-4">
            {exercise ? (
              <span className="hidden max-w-[32ch] truncate text-sm text-(--m3-on-surface-variant) lg:block">
                <span className="text-(--m3-on-surface)">{exercise.display_name}</span>
                <span className="ml-2 font-mono text-[11px] opacity-60">#{exercise.exo_id}</span>
              </span>
            ) : null}
            <AvatarMenu
              avatars={avatars}
              selected={avatar}
              onSelect={(id) => setAvatar(id)}
              onUpload={() => setAvatarDialog(true)}
            />
            <M3Button size="sm" variant="outlined" onClick={() => setEquipmentDialog(true)} title="3D models of the catalog equipment">
              <Dumbbell className="h-3.5 w-3.5" /> Equipment
            </M3Button>
          </div>
        }
        left={<CatalogSidebar exercises={exercises} loading={catalogLoading} />}
        center={<StudioViewport />}
        right={
          <InspectorPanel
            key={`${exercise?.id ?? "none"}:${avatar?.id ?? "none"}`}
            exercise={exercise}
            avatar={avatar}
            settings={settings}
            vectors={vectors}
            vectorsLoading={vectorsLoading}
            equipmentCodes={equipmentCodes}
            supportCodes={supportCodes}
            generating={generating}
            busyVectorId={busyVectorId}
            onGenerate={onGenerate}
            onVectorAction={onVectorAction}
          />
        }
      />
      {equipmentDialog ? <EquipmentDialog onClose={() => setEquipmentDialog(false)} onChanged={() => void mutateEquipment()} /> : null}
      {avatarDialog ? (
        <AvatarDialog
          hasDefault={avatars.some((a) => a.is_default)}
          onClose={() => setAvatarDialog(false)}
          onCreated={(created) => {
            setAvatarDialog(false);
            void mutateAvatars();
            setAvatar(created.id);
          }}
        />
      ) : null}
    </>
  );
}
