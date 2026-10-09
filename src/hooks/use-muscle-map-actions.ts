"use client";

import { useCallback } from "react";
import { mutate } from "swr";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useGenerationConfirm } from "@/hooks/use-generation-confirm";
import { useGenerationJobs } from "@/hooks/use-generation-jobs";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import type {
  MuscleMapBoardTarget,
  MuscleMapImage,
  MuscleMapSlot,
  MuscleMapTargetRef,
} from "@/lib/images/types";
import type { GenerationJob, JobSpec, MuscleMapJobOptions } from "@/lib/images/job-types";
import { isActiveJob, jobSlot, jobTarget } from "@/lib/images/job-types";
import { muscleMapSlotLabel, sameMuscleMapSlot, sameMuscleMapTarget } from "@/lib/images/types";

/** One-off edits for a single generation: a prompt text and/or library references. */
export type MuscleMapRun = MuscleMapJobOptions;

/** One map to make: a target and one of its view × crop slots. */
export type MuscleMapPick = { target: MuscleMapTargetRef; slot: MuscleMapSlot };

export function muscleMapBoardKey(styleId: string | null): string | null {
  return styleId ? `/api/images/muscle-maps?style=${styleId}` : null;
}

/**
 * What can be done to muscle maps of a style, shared by the board (batch runs) and a target's
 * page: queue maps on the server (one with the cost rule, or a batch), and activate /
 * deactivate / delete with confirmation, toasts and Undo. Finished maps and every change
 * refetch the board, the one source of maps.
 */
export function useMuscleMapActions(styleId: string | null) {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const confirm = useConfirm();
  const confirmGeneration = useGenerationConfirm();
  const boardKey = muscleMapBoardKey(styleId);

  const refresh = useCallback(async () => {
    if (boardKey) await mutate(boardKey);
  }, [boardKey]);

  const jobs = useGenerationJobs(styleId, { kind: "muscle_map" }, () => void refresh());

  /**
   * Queues one map per pick; returns how many maps were queued. With `variants` > 1 each gets
   * that many inactive candidates and the active maps stay.
   */
  async function enqueue(
    picks: MuscleMapPick[],
    run?: MuscleMapRun,
    variants = 1,
  ): Promise<number> {
    const specs: JobSpec[] = picks.flatMap(({ target, slot }) =>
      Array.from({ length: variants }, () => ({
        kind: "muscle_map" as const,
        target: { kind: target.kind, id: target.id },
        slot: { view: slot.view, crop: slot.crop },
        options: variants > 1 ? { ...run, candidate: true } : run,
      })),
    );
    await jobs.enqueue(specs);
    return specs.length;
  }

  /** One slot of one target, with this page's prompt edit and references (and candidates). */
  async function generateOne(
    target: MuscleMapTargetRef,
    slot: MuscleMapSlot,
    run: MuscleMapRun,
    variants = 1,
  ) {
    if (!(await confirmGeneration.run(variants))) return;
    try {
      await enqueue([{ target, slot }], run, variants);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed", "Could not queue");
    }
  }

  /** Queues an edit of a map; the result lands in its slot's history as a candidate. */
  async function editMap(target: MuscleMapTargetRef, image: MuscleMapImage, instruction: string) {
    if (!(await confirmGeneration.run(1))) return;
    try {
      await jobs.enqueue([
        {
          kind: "muscle_map",
          target: { kind: target.kind, id: target.id },
          slot: { view: image.view, crop: image.crop },
          options: { editOf: image.id, instruction },
        },
      ]);
      success("Edit queued: it will appear in the map's history");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed", "Could not queue");
    }
  }

  /** Makes a one-off prompt text the style's muscle map prompt; true when saved. */
  async function saveMapPrompt(promptId: string, text: string): Promise<boolean> {
    const ok = await confirm({
      title: "Save as the style's muscle map prompt?",
      description:
        "Every future map of this style uses it. The current text stays in the prompt's history on Styles → Prompts.",
      confirmLabel: "Save to style",
    });
    if (!ok || !styleId) return false;
    try {
      await staffFetch(`/api/images/prompts/${promptId}`, {
        method: "PUT",
        body: JSON.stringify({ content: text }),
      });
      await mutate(`/api/images/prompts?styleId=${styleId}`);
      success("Saved as the style's muscle map prompt");
      return true;
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
      return false;
    }
  }

  const matches = (job: GenerationJob, target: MuscleMapTargetRef, slot?: MuscleMapSlot) => {
    if (!sameMuscleMapTarget(jobTarget(job), target)) return false;
    const ofJob = jobSlot(job);
    return !slot || (ofJob != null && sameMuscleMapSlot(ofJob, slot));
  };

  /** Activating a map deactivates the one active for its target, view and crop (server side). */
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
        success(`${muscleMapSlotLabel(image)} map deleted`);
      } else {
        const activate = change === "activate";
        // The way back: reactivate the map this one displaces, or flip this one back.
        const displaced = activate
          ? target.images.find(
              (img) => sameMuscleMapSlot(img, image) && img.active && img.id !== image.id,
            )
          : undefined;
        const undo = displaced
          ? { id: displaced.id, active: true }
          : { id: image.id, active: !activate };
        await setMapActive(image.id, activate);
        const done = activate ? "set as active" : "deactivated";
        success(`${muscleMapSlotLabel(image)} map ${done}`, undefined, {
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
    jobs,
    enqueue,
    generateOne,
    editMap,
    saveMapPrompt,
    update,
    /** A map of this target and slot is queued or being made. */
    isBusy: (target: MuscleMapTargetRef, slot: MuscleMapSlot) =>
      jobs.jobs.some((job) => isActiveJob(job) && matches(job, target, slot)),
    /** This target's maps that failed, newest runs last. */
    failedFor: (target: MuscleMapTargetRef) =>
      jobs.jobs.filter((job) => job.status === "error" && matches(job, target)),
  };
}
