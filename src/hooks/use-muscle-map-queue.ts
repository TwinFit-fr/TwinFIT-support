"use client";

import { useCallback, useRef, useState } from "react";
import type { StepStatus } from "@/hooks/use-generation-queue";
import { createPrioritySemaphore } from "@/lib/priority-semaphore";
import type { MuscleMapTargetRef, MuscleMapView } from "@/lib/images/types";
import { muscleMapTargetKey } from "@/lib/images/types";

export type MuscleMapQueueItem = {
  key: string;
  target: MuscleMapTargetRef;
  name: string;
  view: MuscleMapView;
  status: StepStatus;
  error?: string;
};

/** Generates targets × views; every map is independent, at most `maxConcurrency` at once. */
export function useMuscleMapQueue() {
  const [items, setItems] = useState<MuscleMapQueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const cancelledRef = useRef(false);

  const patch = useCallback((key: string, next: Partial<MuscleMapQueueItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...next } : item)));
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setItems((prev) =>
      prev.map((item) =>
        item.status === "waiting" ? { ...item, status: "cancelled" as const } : item,
      ),
    );
  }, []);

  const start = useCallback(
    async (options: {
      targets: { target: MuscleMapTargetRef; name: string }[];
      views: MuscleMapView[];
      maxConcurrency: number;
      generate: (target: MuscleMapTargetRef, view: MuscleMapView) => Promise<void>;
    }) => {
      if (running) return;
      const queue: MuscleMapQueueItem[] = options.targets.flatMap(({ target, name }) =>
        options.views.map((view) => ({
          key: `${muscleMapTargetKey(target)}:${view}`,
          target,
          name,
          view,
          status: "waiting" as const,
        })),
      );
      if (!queue.length) return;
      cancelledRef.current = false;
      setItems(queue);
      setRunning(true);

      const slots = createPrioritySemaphore(options.maxConcurrency);
      await Promise.all(
        queue.map(async (item, index) => {
          await slots.acquire(index);
          try {
            if (cancelledRef.current) return;
            patch(item.key, { status: "processing" });
            await options.generate(item.target, item.view);
            patch(item.key, { status: "done" });
          } catch (error) {
            patch(item.key, {
              status: "error",
              error: error instanceof Error ? error.message : "Failed",
            });
          } finally {
            slots.release();
          }
        }),
      );
      setRunning(false);
    },
    [running, patch],
  );

  return {
    items,
    running,
    start,
    cancel,
    done: items.filter((i) => i.status === "done").length,
    errors: items.filter((i) => i.status === "error").length,
    total: items.length,
  };
}
