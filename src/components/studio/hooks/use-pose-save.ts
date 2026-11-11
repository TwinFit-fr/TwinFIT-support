"use client";

import { useCallback, useState } from "react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { useToast } from "@/components/ui/toast";
import { isPoseClipJson, posesFromClip, type PoseClipJson } from "@/lib/studio/anatomy";
import { fetchStudioAsset } from "@/lib/studio/asset-auth";
import { clipFrom } from "@/lib/studio/pose-origin";
import { useStudioStore } from "@/lib/studio/store";
import { studioAssetUrl } from "@/lib/studio/storage-url";
import type { PoseDraft } from "@/lib/studio/template-draft";
import type { BaseAvatar, EquipmentItem, MovementVector, StudioExercise, StudioSettings } from "@/lib/studio/types";
import type { DraftRequest, SaveMode } from "../pose-editor";

/**
 * The pose editor's lifecycle: open a saved clip or an instant draft, ask the AI for a draft,
 * save in place or as a new row. A save keeps the editor open on the stored clip.
 */
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
  const markPoseSaved = useStudioStore((s) => s.markPoseSaved);
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
      // Another exercise or avatar was picked while the clip was downloading: it no longer belongs on the stage.
      const now = useStudioStore.getState();
      if (now.exerciseId !== exercise.id || now.avatarId !== avatar.id) return;
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
        origin: { kind: "clip", vectorId: target.id, seq: target.seq, from: clipFrom(json.meta) },
      });
      setVector(target.id);
    },
    [exercise, avatar, startPoseEdit, setVector],
  );

  /** Open the editor on an unsaved draft (the exercise's template, or a neutral pose): untouched, so it is dropped silently. */
  const onOpenDraft = useCallback(
    (draft: PoseDraft, items: EquipmentItem[]) => {
      if (!exercise || !avatar) return;
      startPoseEdit({
        vectorId: null,
        sourceSeq: null,
        exerciseId: exercise.id,
        avatarId: avatar.id,
        items,
        poses: draft.poses,
        labels: draft.labels,
        weights: draft.weights,
        mode: draft.mode,
        durationS: Number(settings?.pipeline.duration_s ?? 4),
        fps: Number(settings?.pipeline.fps ?? 30),
        twoHanded: draft.twoHanded,
        grip: draft.grip,
        mirror: true,
        meta: { exo_id: exercise.exo_id, avatar_code: avatar.code, rig: avatar.rig, ...draft.meta },
        origin: draft.origin,
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
        // The stored clip becomes the one on the stage and in the editor; its label says so (no toast over the buttons).
        markPoseSaved({ id: body.vector.id, seq: body.vector.seq });
        await refresh();
        setVector(body.vector.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save the poses");
      } finally {
        setSaving(false);
      }
    },
    [staffFetch, markPoseSaved, refresh, setVector, toast],
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
        })) as {
          draft: {
            poses: PoseClipJson["keyframes"][number]["angles"][];
            labels: string[];
            weights: number[];
            mode: "pingpong" | "cycle";
            notes: string;
            grip: string | null;
            template: string | null;
            params: Record<string, unknown> | null;
            unilateral: boolean;
            airborne: boolean;
            moving: boolean;
          };
        };
        const proposal = body.draft;
        replacePoses({
          poses: proposal.poses,
          mode: proposal.mode,
          weights: proposal.weights,
          labels: proposal.labels,
          grip: proposal.grip,
          ...(proposal.template ? { twoHanded: false } : {}),
          meta: { template: proposal.template, template_params: proposal.params, unilateral: proposal.unilateral, airborne: proposal.airborne, moving: proposal.moving },
          // The editor's origin line shows this for as long as these poses are on the stage.
          origin: { kind: "ai", template: proposal.template, params: proposal.params, notes: proposal.notes || null },
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not draft the poses");
      } finally {
        setDrafting(false);
      }
    },
    [staffFetch, replacePoses, toast],
  );

  return { onEditPoses, onOpenDraft, onSavePoses, onDraftPoses, saving, drafting };
}
