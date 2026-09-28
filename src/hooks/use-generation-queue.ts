"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerationParams } from "@/lib/images/types";

export type QueueItem = {
  exoId: number;
  name: string;
  status: "waiting" | "processing" | "done" | "error" | "cancelled";
  error?: string;
};

type GenerateFn = (exoId: number) => Promise<void>;

export function useGenerationQueue(concurrency = 3) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const cancelledRef = useRef(false);
  const generateRef = useRef<GenerateFn | null>(null);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setItems((prev) =>
      prev.map((item) =>
        item.status === "waiting" || item.status === "processing"
          ? { ...item, status: "cancelled" }
          : item,
      ),
    );
    setRunning(false);
  }, []);

  const start = useCallback(
    async (
      selected: { exoId: number; name: string }[],
      generate: GenerateFn,
    ) => {
      if (!selected.length || running) return;
      cancelledRef.current = false;
      generateRef.current = generate;
      const queue: QueueItem[] = selected.map((item) => ({
        exoId: item.exoId,
        name: item.name,
        status: "waiting",
      }));
      setItems(queue);
      setRunning(true);

      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (!cancelledRef.current) {
          const index = cursor++;
          if (index >= queue.length) break;
          setItems((prev) =>
            prev.map((item, i) =>
              i === index ? { ...item, status: "processing" } : item,
            ),
          );
          try {
            await generate(queue[index].exoId);
            if (cancelledRef.current) break;
            setItems((prev) =>
              prev.map((item, i) =>
                i === index ? { ...item, status: "done" } : item,
              ),
            );
          } catch (error) {
            setItems((prev) =>
              prev.map((item, i) =>
                i === index
                  ? {
                      ...item,
                      status: "error",
                      error: error instanceof Error ? error.message : "Failed",
                    }
                  : item,
              ),
            );
          }
        }
      });

      await Promise.all(workers);
      setRunning(false);
    },
    [concurrency, running],
  );

  const done = items.filter((i) => i.status === "done").length;
  const errors = items.filter((i) => i.status === "error").length;
  const total = items.length;

  return { items, running, start, cancel, done, errors, total };
}

export function loadPreset(): GenerationParams & {
  systemPromptId: string | null;
  exercisePromptId: string | null;
} {
  const defaults = {
    model: "gpt-image-1",
    shape: "square",
    size: "1K",
    background: "auto",
    format: "png",
    quality: "auto",
    systemPromptId: null as string | null,
    exercisePromptId: null as string | null,
  };
  try {
    const raw = localStorage.getItem("twinfit.images.generationPreset");
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function savePreset(
  preset: GenerationParams & {
    systemPromptId: string | null;
    exercisePromptId: string | null;
  },
) {
  localStorage.setItem("twinfit.images.generationPreset", JSON.stringify(preset));
}

export function usePresetState() {
  const [preset, setPreset] = useState(loadPreset);
  useEffect(() => {
    savePreset(preset);
  }, [preset]);
  return [preset, setPreset] as const;
}
