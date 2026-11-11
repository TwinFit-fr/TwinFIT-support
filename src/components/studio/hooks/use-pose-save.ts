"use client";

import { useCallback, useState } from "react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { useToast } from "@/components/ui/toast";
import { isPoseClipJson, poseClipFromDraft, posesFromClip, type PoseClipJson } from "@/lib/studio/anatomy";
import { fetchStudioAsset } from "@/lib/studio/asset-auth";
import { clipFrom } from "@/lib/studio/pose-origin";
import { labelsFromClip } from "@/lib/studio/pose-names";
import { useStudioStore } from "@/lib/studio/store";
import { studioAssetUrl } from "@/lib/studio/storage-url";
import type { PoseDraft } from "@/lib/studio/template-draft";
import type { BaseAvatar, EquipmentItem, MovementVector, StudioExercise, StudioSettings } from "@/lib/studio/types";
import type { SaveMode } from "../pose-editor";

/**
 * The pose editor's lifecycle: open a saved clip or an instant draft, save in place or as a new
 * row (the AI draft is use-ai-draft.ts). A save keeps the editor open on the stored clip.
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
  const setVector = useStudioStore((s) => s.setVector);
  const [saving, setSaving] = useState(false);

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
      startPoseEdit({
        weights,
        // The names saved with the clip, one per pose (pose-names.ts).
        labels: labelsFromClip(json.meta, poses.length),
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
        playOnce();
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

  return { onEditPoses, onOpenDraft, onSavePoses, saving };
}

/**
 * The clip just saved plays once on the stage, from its start, so the result is seen without
 * pressing Play; then the pose being edited is held again. Not with reduced motion, and not if the
 * user has meanwhile paused, played on or changed the poses.
 */
function playOnce() {
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const state = useStudioStore.getState();
  const edit = state.poseEdit;
  if (!edit || state.playing) return;
  const ms = (poseClipFromDraft(edit).duration / (state.speed || 1)) * 1000;
  state.setPlaying(true);
  const poses = edit.poses;
  window.setTimeout(() => {
    const now = useStudioStore.getState();
    if (now.playing && now.poseEdit?.poses === poses) now.setPlaying(false);
  }, ms + 150);
}
