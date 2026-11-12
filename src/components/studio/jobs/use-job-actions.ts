"use client";

import { useCallback, useState } from "react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { EQUIPMENT_KEY } from "@/lib/studio/equipment";
import type { JobAction, StudioJob } from "@/lib/studio/jobs";
import { avatarBuildRequest, equipmentBuildRequest, generationRequest } from "@/lib/studio/paid-actions";
import type { BaseAvatar } from "@/lib/studio/types";
import { usePaidConfirm, useStudioConfirm } from "../studio-confirm";

export type JobHandlers = {
  /** Show an AI movement: its clip in the editor when done, else its row in the exercise's queue. */
  onOpenGeneration: (job: StudioJob) => void;
  /** Put a finished avatar on the stage (through the unsaved-work guard). */
  onUseAvatar: (avatarId: string) => void;
  onOpenEquipment: () => void;
  /** After a retry or a stop: the lists that row lives in. */
  onChanged: (kind: StudioJob["kind"]) => void;
};

/**
 * The tray's actions. Every retry spends again (Meshy credits, OpenAI usage) and goes through the
 * paid confirmation first; stopping is only
 * offered on a queued AI movement (the worker only claims queued rows, so it really stops it).
 */
export function useJobActions(handlers: JobHandlers & { avatars: BaseAvatar[]; defaultModel: string | null; dismiss: (ids: string[]) => void }) {
  const { onOpenGeneration, onUseAvatar, onOpenEquipment, onChanged, avatars, defaultModel, dismiss } = handlers;
  const staffFetch = useStaffFetch();
  const paidConfirm = usePaidConfirm();
  const confirm = useStudioConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    async (job: StudioJob, action: JobAction) => {
      if (action === "dismiss") return dismiss([job.id]);
      if (action === "open") return job.kind === "generation" ? onOpenGeneration(job) : onOpenEquipment();
      if (action === "use") return job.avatarId ? onUseAvatar(job.avatarId) : undefined;

      let request: (() => Promise<unknown>) | null = null;
      if (action === "stop" && job.kind === "generation") {
        const ok = await confirm({
          title: `Take ${job.subject} out of the queue?`,
          description: "It has not started yet, so nothing is spent. The row stays in the exercise's history as stopped; Retry puts it back in the queue.",
          confirmLabel: "Stop",
          danger: true,
        });
        if (ok) request = () => staffFetch(`/api/studio/vectors/${job.rowId}`, { method: "PATCH", body: JSON.stringify({ action: "fail", error: "Stopped by staff before it started" }) });
      } else if (action === "retry" && job.kind === "generation") {
        const avatarName = avatars.find((a) => a.id === job.avatarId)?.name ?? "its avatar";
        const ok = await paidConfirm(generationRequest({ exercise: job.subject, avatar: avatarName, model: job.model ?? defaultModel, retry: true }));
        if (ok) request = () => staffFetch(`/api/studio/vectors/${job.rowId}`, { method: "PATCH", body: JSON.stringify({ action: "requeue" }) });
      } else if (action === "retry" && job.kind === "avatar") {
        const avatar = avatars.find((a) => a.id === job.avatarId);
        const ok = await paidConfirm(avatarBuildRequest({ name: job.subject, subject: avatar?.subject ?? "character", retry: true }));
        if (ok) request = () => staffFetch(`/api/studio/avatars/${job.rowId}`, { method: "PATCH", body: JSON.stringify({ action: "retry" }) });
      } else if (action === "retry" && job.kind === "equipment" && job.equipment) {
        const { kind, code, name, prompt } = job.equipment;
        const ok = await paidConfirm(equipmentBuildRequest({ names: [name], retry: true }));
        if (ok) request = () => staffFetch(EQUIPMENT_KEY, { method: "POST", body: JSON.stringify({ kind, code, prompt }) });
      }
      if (!request) return;

      setBusy(job.id);
      setErrors(({ [job.id]: _dropped, ...rest }) => rest);
      try {
        await request();
        // A retried failure becomes a new attempt (same row) or a new model: the old row's job leaves the tray.
        if (action === "retry" && job.kind === "equipment") dismiss([job.id]);
      } catch (err) {
        setErrors((e) => ({ ...e, [job.id]: `${action === "stop" ? "Stop" : "Retry"} did not go through: ${err instanceof Error ? err.message : "the request failed"}` }));
      } finally {
        setBusy(null);
        onChanged(job.kind);
      }
    },
    [avatars, confirm, defaultModel, dismiss, onChanged, onOpenEquipment, onOpenGeneration, onUseAvatar, paidConfirm, staffFetch],
  );

  return { run, busy, errors };
}
