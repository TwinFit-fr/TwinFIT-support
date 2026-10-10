"use client";

import { useCallback, useState } from "react";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { DEFAULT_ADJUST, UPLOAD_ADJUST, type AdjustParams } from "@/lib/muscle-map/mask-ops";
import { mapLimit } from "@/lib/muscle-map/pool";
import type { MapMask, MapView, MuscleMapBoard, MuscleMapSettings } from "@/lib/muscle-map/types";

export type Upload = { mimeType: string; data: string };

/** Masks generated at once by "Generate missing" (no queue: the page runs them). */
export const BATCH_CONCURRENCY = 3;

/** Per-muscle state of a running generation (single or batch). */
export type MuscleRun =
  | { status: "queued" }
  | { status: "running" }
  | { status: "error"; error: string };

/** The muscle map board and its actions; each action reloads the board when done. */
export function useMuscleMap() {
  const staffFetch = useStaffFetch();
  const board = useStaffSWR<MuscleMapBoard>("/api/muscle-map");
  const { mutate } = board;
  const [runs, setRuns] = useState<Record<string, MuscleRun>>({});

  const send = useCallback(
    async (url: string, method: string, body?: unknown) => {
      try {
        return await staffFetch(url, {
          method,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } finally {
        await mutate();
      }
    },
    [staffFetch, mutate],
  );

  const sourceBody = (upload?: Upload) =>
    upload ? { action: "upload", ...upload } : { action: "generate" };

  const setRun = useCallback((muscleId: string, run: MuscleRun | null) => {
    setRuns((current) => {
      const next = { ...current };
      if (run) next[muscleId] = run;
      else delete next[muscleId];
      return next;
    });
  }, []);

  /** One mask for a muscle; its card shows the run state. Resolves the error message, if any. */
  const createMask = useCallback(
    async (muscleId: string, upload?: Upload): Promise<string | null> => {
      setRun(muscleId, { status: "running" });
      try {
        await staffFetch(`/api/muscle-map/masks?muscle_id=${muscleId}`, {
          method: "POST",
          body: JSON.stringify(sourceBody(upload)),
        });
        setRun(muscleId, null);
        return null;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Mask creation failed";
        setRun(muscleId, { status: "error", error: message });
        return message;
      }
    },
    [staffFetch, setRun],
  );

  return {
    ...board,
    runs,
    saveSettings: (set: Partial<Omit<MuscleMapSettings, "updated_at">>) =>
      send("/api/muscle-map/settings", "PATCH", set),
    addMuscle: (muscleId: string, view: MapView) =>
      send("/api/muscle-map/muscles", "POST", { muscle_id: muscleId, view }),
    setMuscleView: (muscleId: string, view: MapView) =>
      send("/api/muscle-map/muscles", "PATCH", { muscle_id: muscleId, view }),
    removeMuscle: (muscleId: string) =>
      send(`/api/muscle-map/muscles?muscle_id=${muscleId}`, "DELETE"),
    createBase: (view: MapView, upload?: Upload) =>
      send(`/api/muscle-map/bases?view=${view}`, "POST", sourceBody(upload)),
    setBaseActive: (id: string, active: boolean) =>
      send(`/api/muscle-map/bases/${id}`, "PATCH", { active }),
    deleteBase: (id: string) => send(`/api/muscle-map/bases/${id}`, "DELETE"),
    copyMasks: (toBaseId: string, fromBaseId: string) =>
      send(`/api/muscle-map/bases/${toBaseId}/copy-masks`, "POST", {
        from_base_id: fromBaseId,
      }) as Promise<{ copied: number; failed: number }>,
    createMask: async (muscleId: string, upload?: Upload) => {
      const error = await createMask(muscleId, upload);
      await mutate();
      return error;
    },
    /** Generates masks for these muscles, a few at a time; resolves how many failed. */
    generateMasks: async (muscleIds: string[]) => {
      for (const id of muscleIds) setRun(id, { status: "queued" });
      const results = await mapLimit(muscleIds, BATCH_CONCURRENCY, async (id) => {
        const error = await createMask(id);
        void mutate();
        return error;
      });
      await mutate();
      return results.filter((r) => !r.ok || r.value).length;
    },
    adjustMask: (id: string, adjust: AdjustParams) =>
      send(`/api/muscle-map/masks/${id}`, "PATCH", { action: "adjust", adjust }),
    /**
     * Re-extracts masks from their sources with their own settings, filling the ones they miss
     * (e.g. volume) with the defaults; no generation. Resolves how many failed.
     */
    reshadeMasks: async (masks: MapMask[]) => {
      const results = await mapLimit(masks, BATCH_CONCURRENCY, (mask) =>
        staffFetch(`/api/muscle-map/masks/${mask.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            action: "adjust",
            adjust: {
              ...(mask.method === "uploaded" ? UPLOAD_ADJUST : DEFAULT_ADJUST),
              ...mask.params.adjust,
            },
          }),
        }),
      );
      await mutate();
      return results.filter((r) => !r.ok).length;
    },
    setMaskActive: (id: string, active: boolean) =>
      send(`/api/muscle-map/masks/${id}`, "PATCH", {
        action: active ? "activate" : "deactivate",
      }),
    deleteMask: (id: string) => send(`/api/muscle-map/masks/${id}`, "DELETE"),
  };
}

export type MuscleMapApi = ReturnType<typeof useMuscleMap>;
