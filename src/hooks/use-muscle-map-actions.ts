"use client";

import { useCallback, useState } from "react";
import { mutate } from "swr";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useGenerationConfirm } from "@/hooks/use-generation-confirm";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import type {
  MuscleMapBoardTarget,
  MuscleMapImage,
  MuscleMapTargetRef,
  MuscleMapView,
} from "@/lib/images/types";
import { muscleMapTargetKey } from "@/lib/images/types";

/** One-off edits for a single generation: a prompt text and/or library references. */
export type MuscleMapRun = { promptOverride?: string; referenceIds?: string[] };

const VIEW_LABEL: Record<MuscleMapView, string> = { front: "Front", back: "Back" };

export function muscleMapBoardKey(styleId: string | null): string | null {
  return styleId ? `/api/images/muscle-maps?style=${styleId}` : null;
}

/**
 * What can be done to muscle maps of a style, shared by the board (batch runs) and a target's
 * page: generate (raw for queues, or one map with feedback), and activate / deactivate / delete
 * with confirmation, toasts and Undo. Every change refetches the board, the one source of maps.
 */
export function useMuscleMapActions(styleId: string | null) {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const confirm = useConfirm();
  const confirmGeneration = useGenerationConfirm();
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const boardKey = muscleMapBoardKey(styleId);

  const refresh = useCallback(async () => {
    if (boardKey) await mutate(boardKey);
  }, [boardKey]);

  /** Generates one map and refetches; throws on failure (queues report it per item). */
  const generate = useCallback(
    async (target: MuscleMapTargetRef, view: MuscleMapView, run: MuscleMapRun = {}) => {
      if (!styleId) throw new Error("Select a style first");
      await staffFetch("/api/images/muscle-maps/generate", {
        method: "POST",
        body: JSON.stringify({
          styleId,
          target: { kind: target.kind, id: target.id },
          view,
          ...run,
        }),
      });
      await refresh();
    },
    [staffFetch, styleId, refresh],
  );

  async function generateOne(target: MuscleMapBoardTarget, view: MuscleMapView, run: MuscleMapRun) {
    if (!(await confirmGeneration.run(1))) return;
    const key = `${muscleMapTargetKey(target)}:${view}`;
    setBusy((prev) => new Set(prev).add(key));
    try {
      await generate(target, view, run);
      success(`${target.name} · ${VIEW_LABEL[view]} generated`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  /** Activating a map deactivates the one active for its target and view (server side). */
  async function setMapActive(id: string, active: boolean) {
    await staffFetch(`/api/images/muscle-maps/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    });
  }

  async function restore(id: string, active: boolean) {
    try {
      await setMapActive(id, active);
      success("Change undone");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Undo failed");
    }
  }

  async function update(
    target: MuscleMapBoardTarget,
    image: MuscleMapImage,
    change: "activate" | "deactivate" | "delete",
  ) {
    try {
      if (change === "delete") {
        const remove = await confirm({
          title: "Delete this muscle map?",
          description: "This cannot be undone.",
          confirmLabel: "Delete",
          variant: "danger",
        });
        if (!remove) return;
        await staffFetch(`/api/images/muscle-maps/items/${image.id}`, { method: "DELETE" });
        success(`${VIEW_LABEL[image.view]} map deleted`);
      } else {
        const activate = change === "activate";
        // The way back: reactivate the map this one displaces, or flip this one back.
        const displaced = activate
          ? target.images.find(
              (img) => img.view === image.view && img.active && img.id !== image.id,
            )
          : undefined;
        const undo = displaced
          ? { id: displaced.id, active: true }
          : { id: image.id, active: !activate };
        await setMapActive(image.id, activate);
        const done = activate ? "set as active" : "deactivated";
        success(`${VIEW_LABEL[image.view]} map ${done}`, undefined, {
          label: "Undo",
          onClick: () => void restore(undo.id, undo.active),
        });
      }
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return {
    generate,
    generateOne,
    update,
    isBusy: (target: MuscleMapTargetRef, view: MuscleMapView) =>
      busy.has(`${muscleMapTargetKey(target)}:${view}`),
  };
}
