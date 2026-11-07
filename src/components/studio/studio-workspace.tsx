"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccessToken } from "@nhost/react";
import { ChevronDown, Download, Dumbbell, Plus } from "lucide-react";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { equipmentKey, placementOf } from "@/lib/studio/equipment";
import { EMPTY_SCENE, useStudioStore, type SceneSource } from "@/lib/studio/store";
import type { ActiveEquipmentModels, BaseAvatar, EquipmentItem, MovementVector, StudioExercise, StudioSettings } from "@/lib/studio/types";
import { isQueued } from "@/lib/studio/types";
import { AvatarDialog } from "./avatar-dialog";
import { EQUIPMENT_KEY, EquipmentDialog, type EquipmentResponse } from "./equipment-dialog";
import { CatalogSidebar } from "./catalog-sidebar";
import { InspectorPanel, type GenerateInput, type VectorAction } from "./inspector-panel";
import { PoseEditor } from "./pose-editor";
import { RigEditor } from "./rig-editor";
import { NEUTRAL_POSE, isPoseClipJson, posesFromClip, type PoseClipJson } from "@/lib/studio/anatomy";
import { StudioShell } from "./studio-shell";
import { M3Button } from "./ui";
import { StudioViewport } from "./viewer/studio-viewport";

const QUEUE_POLL_MS = 3000;
/** While the queue has pending rows the workspace drives the pipeline: one claim per tick. */
const WORKER_TICK_MS = 4000;

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
      {selected ? (
        <a
          href={selected.model_url}
          download={`${selected.code.toLowerCase()}.glb`}
          title="Download this avatar's .glb (upload it to DeepMotion as a custom character so its exports fit the rig)"
          className="studio-state flex h-8 w-8 items-center justify-center rounded-full text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      ) : null}
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
  const poseEdit = useStudioStore((s) => s.poseEdit);
  const startPoseEdit = useStudioStore((s) => s.startPoseEdit);
  const stopPoseEdit = useStudioStore((s) => s.stopPoseEdit);

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
        models[equipmentKey(entry.kind, entry.code)] = {
          id: active.id,
          url: active.model_url,
          placement: placementOf(entry.kind, entry.code, active.params),
        };
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

  // The pipeline runs from here: while this exercise has pending rows, ask the server to claim
  // and process one every few seconds (several tabs may do it; the claim keeps the cap).
  const hasPending = vectors.some((v) => v.status === "pending");
  const ticking = useRef(false);
  const tick = useCallback(async () => {
    if (ticking.current) return;
    ticking.current = true;
    try {
      await staffFetch("/api/studio/worker", { method: "POST", body: JSON.stringify({ max: 1 }) });
    } catch {
      // The row reports its own error on the next poll.
    } finally {
      ticking.current = false;
      void refresh();
    }
  }, [staffFetch, refresh]);
  useEffect(() => {
    if (!hasPending) return;
    void tick();
    const id = window.setInterval(() => void tick(), WORKER_TICK_MS);
    return () => window.clearInterval(id);
  }, [hasPending, tick]);

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

  // Pose editor: from an existing pose clip, or from scratch; saved as a new ready row.
  const [savingPoses, setSavingPoses] = useState(false);
  const onEditPoses = useCallback(
    async (target: MovementVector) => {
      if (!exercise || !avatar || !target.vector_url) return;
      const res = await fetch(target.vector_url);
      if (!res.ok) throw new Error(`Clip download failed (${res.status})`);
      const json = (await res.json()) as unknown;
      if (!isPoseClipJson(json)) throw new Error("Only pose clips (generated or made in the editor) can be edited");
      const { poses, mode } = posesFromClip(json);
      startPoseEdit({
        vectorId: target.id,
        sourceSeq: target.seq,
        exerciseId: exercise.id,
        avatarId: avatar.id,
        items: target.equipment.items ?? [],
        poses: structuredClone(poses),
        mode,
        durationS: json.duration,
        fps: json.fps,
        twoHanded: json.meta?.two_handed === true,
        grip: typeof json.meta?.grip === "string" ? json.meta.grip : null,
        mirror: true,
        meta: { ...(json.meta ?? {}), source_vector: target.id },
      });
      setVector(target.id);
    },
    [exercise, avatar, startPoseEdit, setVector],
  );
  const onNewPoses = useCallback(
    (items: EquipmentItem[]) => {
      if (!exercise || !avatar) return;
      startPoseEdit({
        vectorId: null,
        sourceSeq: null,
        exerciseId: exercise.id,
        avatarId: avatar.id,
        items,
        poses: [structuredClone(NEUTRAL_POSE)],
        mode: "pingpong",
        durationS: Number(settings?.pipeline.duration_s ?? 4),
        fps: Number(settings?.pipeline.fps ?? 30),
        twoHanded: items.some((it) => it.kind === "load" && it.socket && it.socket_b),
        grip: null,
        mirror: true,
        meta: { exo_id: exercise.exo_id, avatar_code: avatar.code, rig: avatar.rig },
      });
    },
    [exercise, avatar, settings, startPoseEdit],
  );
  const onSavePoses = useCallback(
    async (clipJson: PoseClipJson, label: string) => {
      if (!poseEdit || !token) return;
      setSavingPoses(true);
      try {
        const form = new FormData();
        form.set("file", new File([JSON.stringify(clipJson)], "poses.json", { type: "application/json" }));
        form.set(
          "fields",
          JSON.stringify({ exercise_id: poseEdit.exerciseId, avatar_id: poseEdit.avatarId, equipment: { items: poseEdit.items }, prompt: label, source: "pose-editor" }),
        );
        const res = await fetch("/api/studio/vectors/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
        const body = (await res.json()) as { vector?: MovementVector; error?: string };
        if (!res.ok || !body.vector) throw new Error(body.error ?? `Save failed (${res.status})`);
        stopPoseEdit();
        await refresh();
        setVector(body.vector.id);
        toast.success(`Saved as #${body.vector.seq}`, "Poses saved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save the poses");
      } finally {
        setSavingPoses(false);
      }
    },
    [poseEdit, token, stopPoseEdit, refresh, setVector, toast],
  );

  // A finished clip from elsewhere as a new ready row of this exercise.
  const onUploadClip = useCallback(
    async (file: File, items: EquipmentItem[]) => {
      if (!exercise || !avatar || !token) return;
      try {
        const form = new FormData();
        form.set("file", file);
        form.set(
          "fields",
          JSON.stringify({ exercise_id: exercise.id, avatar_id: avatar.id, equipment: { items }, prompt: `Uploaded clip: ${file.name}` }),
        );
        const res = await fetch("/api/studio/vectors/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
        const body = (await res.json()) as { vector?: MovementVector; error?: string };
        if (!res.ok || !body.vector) throw new Error(body.error ?? `Upload failed (${res.status})`);
        await refresh();
        setVector(body.vector.id);
        toast.success(`${file.name} added as #${body.vector.seq}`, "Clip uploaded");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not upload the clip");
      }
    },
    [exercise, avatar, token, refresh, setVector, toast],
  );

  const onVectorAction = useCallback(
    async (target: MovementVector, action: VectorAction, file?: File) => {
      setBusyVectorId(target.id);
      try {
        if (action === "edit") {
          await onEditPoses(target);
          return;
        }
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
    [confirm, staffFetch, token, vectorId, setVector, toast, refresh, onEditPoses],
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
        center={
          <>
            <StudioViewport />
            <RigEditor
              avatar={avatar}
              onSaved={() => {
                void mutateAvatars();
                void mutateEquipment();
              }}
            />
          </>
        }
        right={
          poseEdit ? (
            <PoseEditor onSave={onSavePoses} saving={savingPoses} />
          ) : (
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
            onUploadClip={onUploadClip}
            onNewPoses={onNewPoses}
          />
          )
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
