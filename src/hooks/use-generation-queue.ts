"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FRAME_POSITIONS, SPLIT_FAILED, SUBJECTS } from "@/lib/images/types";
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

type GenerateStepFn = (exoId: number, position: number, subject: Subject) => Promise<void>;
type GenerateSequenceFn = (exoId: number, subject: Subject) => Promise<void>;

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
 * Per exercise, Start runs first and Mid/End follow in parallel.
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
      /** One strip call for all of an exercise's positions, when `canSequence(panels)` allows. */
      generateSequence?: GenerateSequenceFn;
      canSequence?: (panels: number) => boolean;
    }) => {
      const { positions, subject, maxConcurrency, generateStep, generateSequence, canSequence } =
        options;
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
      const runStep = async (index: number, stepIndex: number) => {
        const item = queue[index];
        const position = item.steps[stepIndex].position;
        // Earlier exercises first, and within one exercise Start before Mid/End.
        await slots.acquire(item.ordinal * 10 + position);
        try {
          if (cancelledRef.current) return;
          patchStep(index, stepIndex, { status: "processing", startedAt: Date.now() });
          await generateStep(item.exoId, position, item.subject);
          patchStep(index, stepIndex, { status: "done" });
        } catch (error) {
          patchStep(index, stepIndex, {
            status: "error",
            error: error instanceof Error ? error.message : "Failed",
          });
        } finally {
          slots.release();
        }
      };

      const patchAll = (index: number, step: Partial<QueueStep>) =>
        queue[index].steps.forEach((_, stepIndex) => patchStep(index, stepIndex, step));

      // Returns false when the strip could not be split, so the caller falls back.
      const runSequence = async (index: number): Promise<boolean> => {
        const item = queue[index];
        await slots.acquire(item.ordinal * 10);
        try {
          if (cancelledRef.current) return true;
          patchAll(index, { status: "processing", startedAt: Date.now() });
          await generateSequence!(item.exoId, item.subject);
          patchAll(index, { status: "done" });
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed";
          if (message.startsWith(SPLIT_FAILED)) {
            patchAll(index, { status: "waiting", startedAt: undefined });
            return false;
          }
          patchAll(index, { status: "error", error: message });
          return true;
        } finally {
          slots.release();
        }
      };

      const useSequence = (index: number) => {
        const { framePositions, positions: requested } = exercises[index];
        return (
          Boolean(generateSequence) &&
          framePositions.length > 1 &&
          requested.length === framePositions.length &&
          Boolean(canSequence?.(framePositions.length))
        );
      };

      // Mid/End are generated from the exercise's Start frame, so Start must finish first.
      const runExercise = async (item: QueueItem, index: number) => {
        if (useSequence(index) && (await runSequence(index))) return;
        const startIndex = item.steps.findIndex((s) => s.position === 0);
        if (startIndex >= 0) await runStep(index, startIndex);
        await Promise.all(
          item.steps.map((_, stepIndex) =>
            stepIndex === startIndex ? null : runStep(index, stepIndex),
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

/** A UI preference remembered per browser; read after mount so SSR and hydration match. */
function useStoredChoice<T>(key: string, fallback: T, parse: (raw: unknown) => T | null) {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    try {
      const parsed = parse(JSON.parse(localStorage.getItem(key) ?? "null"));
      if (parsed != null) setValue(parsed);
    } catch {
      // Storage unavailable or corrupt: keep the fallback.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Preference only; ignore storage failures.
      }
    },
    [key],
  );
  return [value, set] as const;
}

const ALL_POSITIONS = FRAME_POSITIONS.map((p) => p.id as number);

export function usePositionSelection() {
  const [positions, setPositions] = useStoredChoice<number[]>(
    "twinfit.images.positions",
    ALL_POSITIONS,
    (raw) => {
      if (!Array.isArray(raw)) return null;
      const valid = ALL_POSITIONS.filter((p) => raw.includes(p));
      return valid.length ? valid : null;
    },
  );
  const setSorted = useCallback(
    (next: number[]) => setPositions(ALL_POSITIONS.filter((p) => next.includes(p))),
    [setPositions],
  );
  return [positions, setSorted] as const;
}

export function useSubjectChoice() {
  return useStoredChoice<SubjectChoice>("twinfit.images.subject", "random", (raw) =>
    raw === "man" || raw === "woman" || raw === "random" ? raw : null,
  );
}

export function useFrameCountChoice() {
  return useStoredChoice<FrameCountChoice>("twinfit.images.frame-count", "exercise", (raw) =>
    raw === "exercise" || raw === 2 || raw === 3 ? raw : null,
  );
}
