"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mutate } from "swr";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import type { GenerationJob, JobSpec, JobStatus } from "@/lib/images/job-types";
import { isActiveJob } from "@/lib/images/job-types";
import type { Subject } from "@/lib/images/types";

/** Polling while a run is active, and while idle (to see runs started elsewhere). */
const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 15_000;
/** How often open pages make sure pending jobs are being processed. */
const KEEPER_INTERVAL_MS = 10_000;

export type StepStatus = "waiting" | "processing" | "done" | "error" | "cancelled";

export type QueueStep = {
  position: number;
  status: StepStatus;
  startedAt?: number;
  error?: string;
};

/** One exercise × subject of a run, with a step per frame position. */
export type QueueItem = {
  batchId: string;
  exoId: number;
  subject: Subject;
  status: StepStatus;
  steps: QueueStep[];
};

const STEP_STATUS: Record<JobStatus, StepStatus> = {
  queued: "waiting",
  running: "processing",
  done: "done",
  error: "error",
  cancelled: "cancelled",
};

function itemStatus(steps: QueueStep[]): StepStatus {
  if (steps.some((s) => s.status === "processing")) return "processing";
  if (steps.some((s) => s.status === "waiting")) return "waiting";
  if (steps.some((s) => s.status === "error")) return "error";
  if (steps.every((s) => s.status === "cancelled")) return "cancelled";
  return "done";
}

export function jobStep(job: GenerationJob): QueueStep {
  return {
    position: job.position ?? 0,
    status: STEP_STATUS[job.status],
    startedAt: job.status === "running" && job.started_at ? Date.parse(job.started_at) : undefined,
    error: job.error ?? undefined,
  };
}

/** Exercise frame jobs grouped per run, exercise and subject, in enqueue order. */
export function frameQueueItems(jobs: GenerationJob[]): QueueItem[] {
  const items = new Map<string, QueueItem>();
  for (const job of jobs) {
    if (job.kind !== "exercise_frame" || job.exo_id == null || !job.subject) continue;
    const key = `${job.batch_id}:${job.exo_id}:${job.subject}`;
    const item = items.get(key) ?? {
      batchId: job.batch_id,
      exoId: job.exo_id,
      subject: job.subject,
      status: "waiting",
      steps: [],
    };
    item.steps.push(jobStep(job));
    items.set(key, item);
  }
  return [...items.values()].map((item) => ({ ...item, status: itemStatus(item.steps) }));
}

/** Counts for a progress bar. */
export function jobProgress(jobs: GenerationJob[]) {
  return {
    total: jobs.length,
    done: jobs.filter((j) => j.status === "done").length,
    failed: jobs.filter((j) => j.status === "error").length,
    active: jobs.some(isActiveJob),
  };
}

const isJobsKey = (key: unknown) => typeof key === "string" && key.startsWith("/api/images/jobs");

/**
 * The server-side generation jobs of a style (one kind, optionally one exercise): active ones
 * and those finished recently, with actions on runs. `onFinished` runs whenever more jobs are
 * done than before, so pages refetch the images they show.
 */
export function useGenerationJobs(
  styleId: string | null,
  filter: { kind: GenerationJob["kind"]; exoId?: number },
  onFinished?: () => void,
) {
  const staffFetch = useStaffFetch();
  const key = styleId
    ? `/api/images/jobs?style=${styleId}&kind=${filter.kind}` +
      (filter.exoId != null ? `&exo=${filter.exoId}` : "")
    : null;
  const { data } = useStaffSWR<{ jobs: GenerationJob[] }>(key, {
    refreshInterval: (latest) => (latest?.jobs.some(isActiveJob) ? ACTIVE_POLL_MS : IDLE_POLL_MS),
  });
  const jobs = useMemo(() => data?.jobs ?? [], [data]);

  const finished = jobs.filter((j) => j.status === "done").length;
  const seen = useRef<number | null>(null);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });
  useEffect(() => {
    if (seen.current !== null && finished > seen.current) onFinishedRef.current?.();
    seen.current = finished;
  }, [finished]);

  const refreshJobs = useCallback(() => mutate(isJobsKey), []);

  const enqueue = useCallback(
    async (specs: JobSpec[]) => {
      if (!styleId) throw new Error("Select a style first");
      const result = (await staffFetch("/api/images/jobs", {
        method: "POST",
        body: JSON.stringify({ styleId, jobs: specs }),
      })) as { batchId: string; jobs: GenerationJob[] };
      await refreshJobs();
      return result;
    },
    [staffFetch, styleId, refreshJobs],
  );

  const batchAction = useCallback(
    async (batchId: string, init: RequestInit) => {
      await staffFetch(`/api/images/jobs/batches/${batchId}`, init);
      await refreshJobs();
    },
    [staffFetch, refreshJobs],
  );

  const batches = [...new Set(jobs.map((j) => j.batch_id))];
  const activeBatches = batches.filter((b) => jobs.some((j) => j.batch_id === b && isActiveJob(j)));

  return {
    jobs,
    progress: jobProgress(jobs),
    enqueue,
    /** Failed and skipped jobs of every listed run go back to the queue. */
    retryFailed: () =>
      Promise.all(
        batches
          .filter((b) => jobs.some((j) => j.batch_id === b && j.status === "error"))
          .map((b) =>
            batchAction(b, { method: "POST", body: JSON.stringify({ action: "retry" }) }),
          ),
      ),
    /** Jobs not started yet are dropped; running ones finish. */
    cancelActive: () =>
      Promise.all(
        activeBatches.map((b) =>
          batchAction(b, { method: "POST", body: JSON.stringify({ action: "cancel" }) }),
        ),
      ),
    /** Clears finished runs from the list (the images stay). */
    dismissFinished: () =>
      Promise.all(
        batches
          .filter((b) => !activeBatches.includes(b))
          .map((b) => batchAction(b, { method: "DELETE" })),
      ),
  };
}

/**
 * Kept running by every open staff page: while jobs wait, ask the server to process them (a
 * drain that ran out of time or token resumes here). Returns the pending counts for display.
 */
export function useJobKeeper() {
  const staffFetch = useStaffFetch();
  const [pending, setPending] = useState({ queued: 0, running: 0 });

  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const counts = (await staffFetch("/api/images/jobs/drain")) as typeof pending;
        if (stopped) return;
        setPending(counts);
        if (counts.queued > 0) await staffFetch("/api/images/jobs/drain", { method: "POST" });
      } catch {
        /* signed out or offline: the next tick tries again */
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), KEEPER_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [staffFetch]);

  return pending;
}
