"use client";

import { useCallback, useState } from "react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useStudioStore } from "@/lib/studio/store";
import type { BaseAvatar, EquipmentItem, MovementVector, StudioExercise } from "@/lib/studio/types";
import type { GenerateInput, VectorAction } from "../inspector-panel";

/** Enqueue, upload, activate, requeue, stop, edit and delete movement vectors of the open exercise. */
export function useVectorActions(input: {
  exercise: StudioExercise | null;
  avatar: BaseAvatar | null;
  refresh: () => Promise<unknown>;
  onEditPoses: (vector: MovementVector) => Promise<void>;
}) {
  const { exercise, avatar, refresh, onEditPoses } = input;
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const confirm = useConfirm();
  const setVector = useStudioStore((s) => s.setVector);
  const [generating, setGenerating] = useState(false);
  const [busyVectorId, setBusyVectorId] = useState<string | null>(null);

  const onGenerate = useCallback(
    async (request: GenerateInput) => {
      if (!exercise || !avatar) return;
      setGenerating(true);
      try {
        const body = (await staffFetch("/api/studio/vectors", {
          method: "POST",
          body: JSON.stringify({
            exercise_id: exercise.id,
            avatar_id: avatar.id,
            prompt: request.prompt,
            equipment: { items: request.items },
            params: request.params,
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

  // A finished clip from elsewhere as a new ready row of this exercise.
  const onUploadClip = useCallback(
    async (file: File, items: EquipmentItem[]) => {
      if (!exercise || !avatar) return;
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("fields", JSON.stringify({ exercise_id: exercise.id, avatar_id: avatar.id, equipment: { items }, prompt: `Uploaded clip: ${file.name}` }));
        const body = (await staffFetch("/api/studio/vectors/upload", { method: "POST", body: form })) as { vector: MovementVector };
        await refresh();
        setVector(body.vector.id);
        toast.success(`${file.name} added as #${body.vector.seq}`, "Clip uploaded");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not upload the clip");
      }
    },
    [exercise, avatar, staffFetch, refresh, setVector, toast],
  );

  const onVectorAction = useCallback(
    async (target: MovementVector, action: VectorAction, payload?: File | string) => {
      setBusyVectorId(target.id);
      try {
        if (action === "edit") {
          await onEditPoses(target);
          return;
        }
        if (action === "delete") {
          const ok = await confirm({
            title: `Delete movement #${target.seq}?`,
            description: "The row is removed from the queue and history, and its clip file with it.",
            confirmLabel: "Delete",
            variant: "danger",
          });
          if (!ok) return;
          await staffFetch(`/api/studio/vectors/${target.id}`, { method: "DELETE" });
          // The editor must not keep saving over a clip that is gone: it lands again on what is left.
          if (useStudioStore.getState().poseEdit?.vectorId === target.id) useStudioStore.getState().stopPoseEdit();
          if (useStudioStore.getState().vectorId === target.id) setVector(null);
          toast.success(`Movement #${target.seq} deleted`);
        } else if (action === "upload") {
          if (!(payload instanceof File)) return;
          const form = new FormData();
          form.set("file", payload);
          const body = (await staffFetch(`/api/studio/vectors/${target.id}/result`, { method: "POST", body: form })) as { vector: MovementVector };
          setVector(body.vector.id);
          toast.success(`Clip attached to #${target.seq}`, "Movement ready");
        } else if (action === "stop") {
          const ok = await confirm({
            title: `Stop movement #${target.seq}?`,
            description: "The row is marked failed. A worker still running it will not be able to store its result.",
            confirmLabel: "Stop",
            variant: "danger",
          });
          if (!ok) return;
          await staffFetch(`/api/studio/vectors/${target.id}`, { method: "PATCH", body: JSON.stringify({ action: "fail", error: "Stopped by staff" }) });
          toast.success(`#${target.seq} stopped`);
        } else if (action === "prompt") {
          if (typeof payload !== "string" || !payload.trim()) return;
          await staffFetch(`/api/studio/vectors/${target.id}`, { method: "PATCH", body: JSON.stringify({ action: "edit", prompt: payload.trim() }) });
          toast.success(`#${target.seq}: prompt updated`);
        } else {
          await staffFetch(`/api/studio/vectors/${target.id}`, { method: "PATCH", body: JSON.stringify({ action }) });
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
    [confirm, staffFetch, setVector, toast, refresh, onEditPoses],
  );

  return { onGenerate, onUploadClip, onVectorAction, generating, busyVectorId };
}
