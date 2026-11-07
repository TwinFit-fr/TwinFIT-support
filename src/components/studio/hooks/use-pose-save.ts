"use client";

import { useCallback, useState } from "react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { useToast } from "@/components/ui/toast";
import { NEUTRAL_POSE, isPoseClipJson, posesFromClip, type PoseClipJson } from "@/lib/studio/anatomy";
import { fetchStudioAsset } from "@/lib/studio/asset-auth";
import { useStudioStore } from "@/lib/studio/store";
import { studioAssetUrl } from "@/lib/studio/storage-url";
import type { BaseAvatar, EquipmentItem, MovementVector, StudioExercise, StudioSettings } from "@/lib/studio/types";
import type { DraftRequest, SaveMode } from "../pose-editor";

/** The pose editor's lifecycle: open from a clip or from scratch, ask the AI for a draft, save in place or as a new row. */
export function usePoseSave(input: {
  exercise: StudioExercise | null;
  avatar: BaseAvatar | null;
  settings: StudioSettings | null;
  refresh: () => Promise<unknown>;
}) {
  const { exercise, avatar, settings, refresh } = input;
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const startPoseEdit = useStudioStore((s) => s.startPoseEdit);
  const stopPoseEdit = useStudioStore((s) => s.stopPoseEdit);
  const replacePoses = useStudioStore((s) => s.replacePoses);
  const setVector = useStudioStore((s) => s.setVector);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const onEditPoses = useCallback(
    async (target: MovementVector) => {
      const url = studioAssetUrl(target.file_id, target.vector_url);
      if (!exercise || !avatar || !url) return;
      const res = await fetchStudioAsset(url);
      if (!res.ok) throw new Error(`Clip download failed (${res.status})`);
      const json = (await res.json()) as unknown;
      if (!isPoseClipJson(json)) throw new Error("Only pose clips (generated or made in the editor) can be edited");
      const { poses, mode, weights } = posesFromClip(json);
      const labels = Array.isArray(json.meta?.labels) && (json.meta.labels as unknown[]).every((l) => typeof l === "string") ? (json.meta.labels as string[]) : null;
      startPoseEdit({
        weights,
        labels: labels && labels.length === poses.length ? labels : null,
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
    async (clipJson: PoseClipJson, label: string, mode: SaveMode) => {
      const draft = useStudioStore.getState().poseEdit;
      if (!draft) return;
      setSaving(true);
      try {
        const form = new FormData();
        form.set("file", new File([JSON.stringify(clipJson)], "poses.json", { type: "application/json" }));
        let body: { vector: MovementVector };
        if (mode === "replace" && draft.vectorId) {
          // Overwrite the clip of the row being edited: no new row, no copies piling up.
          form.set("meta", JSON.stringify({ model: "pose-editor" }));
          body = (await staffFetch(`/api/studio/vectors/${draft.vectorId}/result`, { method: "POST", body: form })) as { vector: MovementVector };
        } else {
          form.set(
            "fields",
            JSON.stringify({ exercise_id: draft.exerciseId, avatar_id: draft.avatarId, equipment: { items: draft.items }, prompt: label, source: "pose-editor" }),
          );
          body = (await staffFetch("/api/studio/vectors/upload", { method: "POST", body: form })) as { vector: MovementVector };
        }
        stopPoseEdit();
        await refresh();
        setVector(body.vector.id);
        toast.success(mode === "replace" ? `#${body.vector.seq} updated` : `Saved as #${body.vector.seq}`, "Poses saved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save the poses");
      } finally {
        setSaving(false);
      }
    },
    [staffFetch, stopPoseEdit, refresh, setVector, toast],
  );

  const onDraftPoses = useCallback(
    async (request: DraftRequest) => {
      const draft = useStudioStore.getState().poseEdit;
      if (!draft) return;
      setDrafting(true);
      try {
        const body = (await staffFetch("/api/studio/poses/draft", {
          method: "POST",
          body: JSON.stringify({
            exercise_id: draft.exerciseId,
            avatar_id: draft.avatarId,
            items: draft.items,
            two_handed: draft.twoHanded,
            instructions: request.instructions || null,
            pose_count: request.poseCount,
          }),
        })) as { draft: { poses: PoseClipJson["keyframes"][number]["angles"][]; labels: string[]; weights: number[]; mode: "pingpong" | "cycle"; notes: string; grip: string | null } };
        replacePoses({ poses: body.draft.poses, mode: body.draft.mode, weights: body.draft.weights, labels: body.draft.labels, grip: body.draft.grip });
        toast.success(body.draft.notes || `${body.draft.poses.length} poses drafted`, "AI draft");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not draft the poses");
      } finally {
        setDrafting(false);
      }
    },
    [staffFetch, replacePoses, toast],
  );

  return { onEditPoses, onNewPoses, onSavePoses, onDraftPoses, saving, drafting };
}
