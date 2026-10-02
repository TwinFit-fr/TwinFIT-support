"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FRAME_POSITIONS, SUBJECTS } from "@/lib/images/types";
import type { FrameCountChoice, Subject, SubjectChoice } from "@/lib/images/types";

export type StepStatus = "waiting" | "processing" | "done" | "error" | "cancelled";

export type QueueStep = {
  position: number;
  status: StepStatus;
  startedAt?: number;
  error?: string;
};

export type QueueItem = {
  exoId: number;
  name: string;
  ordinal: number;
  subject: Subject;
  status: StepStatus;
  steps: QueueStep[];
};

/**
 * Generates one frame and resolves with the new image id. Mid/End receive the Start this run
 * generated as `guideImageId`; without it the server edits the exercise's active Start.
 */
type GenerateStepFn = (
  exoId: number,
  position: number,
  subject: Subject,
  guideImageId?: string,
) => Promise<string>;

function resolveSubject(choice: SubjectChoice): Subject {
  return choice === "random" ? SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)] : choice;
}

function itemStatus(steps: QueueStep[]): StepStatus {
  if (steps.some((s) => s.status === "processing")) return "processing";
  if (steps.some((s) => s.status === "waiting")) return "waiting";
  if (steps.some((s) => s.status === "error")) return "error";
  if (steps.every((s) => s.status === "cancelled")) return "cancelled";
  return "done";
}

/** At most `limit` holders; waiters with the lowest priority number go first. */
function createPrioritySemaphore(limit: number) {
  let active = 0;
  const waiters: { priority: number; resolve: () => void }[] = [];
  return {
    acquire(priority: number): Promise<void> {
      if (active < limit) {
        active++;
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        waiters.push({ priority, resolve });
        waiters.sort((a, b) => a.priority - b.priority);
      });
    },
    release() {
      const next = waiters.shift();
      if (next) next.resolve();
      else active--;
    },
  };
}

/**
 * Runs exercises × positions with at most `maxConcurrency` requests in flight.
 * Per exercise, Start runs first and Mid/End follow in parallel as edits of it.
 */
export function useGenerationQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const cancelledRef = useRef(false);

  const patchStep = useCallback((index: number, stepIndex: number, step: Partial<QueueStep>) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const steps = item.steps.map((s, j) => (j === stepIndex ? { ...s, ...step } : s));
        return { ...item, steps, status: itemStatus(steps) };
      }),
    );
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setItems((prev) =>
      prev.map((item) => {
        const steps = item.steps.map((s) =>
          s.status === "waiting" ? { ...s, status: "cancelled" as const } : s,
        );
        return { ...item, steps, status: itemStatus(steps) };
      }),
    );
  }, []);

  const start = useCallback(
    async (options: {
      /** `framePositions`: positions the exercise uses ([0,2] for two-frame exercises). */
      exercises: { exoId: number; name: string; framePositions: number[] }[];
      positions: number[];
      subject: SubjectChoice;
      maxConcurrency: number;
      generateStep: GenerateStepFn;
    }) => {
      const { positions, subject, maxConcurrency, generateStep } = options;
      if (running) return;
      const exercises = options.exercises
        .map((exercise) => ({
          ...exercise,
          positions: exercise.framePositions.filter((p) => positions.includes(p)),
        }))
        .filter((exercise) => exercise.positions.length > 0);
      if (!exercises.length) return;
      cancelledRef.current = false;
      const queue: QueueItem[] = exercises.map((exercise, i) => ({
        exoId: exercise.exoId,
        name: exercise.name,
        ordinal: i + 1,
        subject: resolveSubject(subject),
        status: "waiting",
        steps: exercise.positions.map((position) => ({ position, status: "waiting" })),
      }));
      setItems(queue);
      setRunning(true);

      const slots = createPrioritySemaphore(maxConcurrency);
      /** Resolves with the new image id, or null when the frame was not generated. */
      const runStep = async (
        index: number,
        stepIndex: number,
        guideImageId?: string,
      ): Promise<string | null> => {
        const item = queue[index];
        const position = item.steps[stepIndex].position;
        // Earlier exercises first, and within one exercise Start before Mid/End.
        await slots.acquire(item.ordinal * 10 + position);
        try {
          if (cancelledRef.current) return null;
          patchStep(index, stepIndex, { status: "processing", startedAt: Date.now() });
          const imageId = await generateStep(item.exoId, position, item.subject, guideImageId);
          patchStep(index, stepIndex, { status: "done" });
          return imageId;
        } catch (error) {
          patchStep(index, stepIndex, {
            status: "error",
            error: error instanceof Error ? error.message : "Failed",
          });
          return null;
        } finally {
          slots.release();
        }
      };

      // Mid/End are edits of this run's Start, so Start must finish first; if it fails they are
      // skipped rather than drawn from an older Start. Without Start in the run, the server
      // uses the exercise's active Start.
      const runExercise = async (item: QueueItem, index: number) => {
        const startIndex = item.steps.findIndex((s) => s.position === 0);
        let startImageId: string | undefined;
        if (startIndex >= 0) {
          const imageId = await runStep(index, startIndex);
          if (!imageId) {
            item.steps.forEach((_, stepIndex) => {
              if (stepIndex !== startIndex && !cancelledRef.current) {
                patchStep(index, stepIndex, { status: "error", error: "Skipped: Start failed" });
              }
            });
            return;
          }
          startImageId = imageId;
        }
        await Promise.all(
          item.steps.map((_, stepIndex) =>
            stepIndex === startIndex ? null : runStep(index, stepIndex, startImageId),
          ),
        );
      };

      await Promise.all(queue.map(runExercise));
      setRunning(false);
    },
    [running, patchStep],
  );

  const steps = items.flatMap((i) => i.steps);
  return {
    items,
    running,
    start,
    cancel,
    exercisesDone: items.filter((i) => i.status === "done" || i.status === "error").length,
    imagesDone: steps.filter((s) => s.status === "done").length,
    imagesTotal: steps.length,
    errors: steps.filter((s) => s.status === "error").length,
  };
}

// Same-tab writes notify through `listeners`; other tabs through the "storage" event.
// `written` keeps this tab's latest values even when localStorage is unavailable.
const listeners = new Set<() => void>();
const written = new Map<string, string>();

function subscribeStorage(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key) written.delete(event.key);
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readStorage(key: string): string | null {
  if (written.has(key)) return written.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A UI preference remembered per browser. The server snapshot is the fallback, so SSR and
 * hydration match. `fallback` and `parse` must be stable (module-level) values.
 */
function useStoredChoice<T>(key: string, fallback: T, parse: (raw: unknown) => T | null) {
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => readStorage(key),
    () => null,
  );
  const value = useMemo(() => {
    if (raw == null) return fallback;
    try {
      return parse(JSON.parse(raw)) ?? fallback;
    } catch {
      // Corrupt value: keep the fallback.
      return fallback;
    }
  }, [raw, fallback, parse]);
  const set = useCallback(
    (next: T) => {
      const json = JSON.stringify(next);
      written.set(key, json);
      try {
        localStorage.setItem(key, json);
      } catch {
        // Preference only; this tab still remembers it through `written`.
      }
      listeners.forEach((notify) => notify());
    },
    [key],
  );
  return [value, set] as const;
}

const ALL_POSITIONS = FRAME_POSITIONS.map((p) => p.id as number);

function parsePositions(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const valid = ALL_POSITIONS.filter((p) => raw.includes(p));
  return valid.length ? valid : null;
}

function parseSubject(raw: unknown): SubjectChoice | null {
  return raw === "man" || raw === "woman" || raw === "random" ? raw : null;
}

function parseFrameCount(raw: unknown): FrameCountChoice | null {
  return raw === "exercise" || raw === 2 || raw === 3 ? raw : null;
}

const DEFAULT_SUBJECT: SubjectChoice = "random";
const DEFAULT_FRAME_COUNT: FrameCountChoice = "exercise";

export function usePositionSelection() {
  const [positions, setPositions] = useStoredChoice(
    "twinfit.images.positions",
    ALL_POSITIONS,
    parsePositions,
  );
  const setSorted = useCallback(
    (next: number[]) => setPositions(ALL_POSITIONS.filter((p) => next.includes(p))),
    [setPositions],
  );
  return [positions, setSorted] as const;
}

export function useSubjectChoice() {
  return useStoredChoice("twinfit.images.subject", DEFAULT_SUBJECT, parseSubject);
}

export function useFrameCountChoice() {
  return useStoredChoice("twinfit.images.frame-count", DEFAULT_FRAME_COUNT, parseFrameCount);
}
