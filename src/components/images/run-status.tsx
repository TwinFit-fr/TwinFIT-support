"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import type { jobProgress } from "@/hooks/use-generation-jobs";
import type { GenerationJob } from "@/lib/images/job-types";
import { cn } from "@/lib/utils";

type Progress = ReturnType<typeof jobProgress>;

/** The failed jobs of a workspace's target, with what went wrong; retry or clear them. */
export function JobFailures({
  jobs,
  labelOf,
  canAct,
  onRetry,
  onDismiss,
}: {
  jobs: GenerationJob[];
  labelOf: (job: GenerationJob) => string;
  /** False while the target still has jobs running. */
  canAct: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (!jobs.length) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      <div className="space-y-0.5">
        {jobs.map((job) => (
          <p key={job.id}>
            <span className="font-medium">{labelOf(job)}:</span> {job.error}
          </p>
        ))}
      </div>
      {canAct && (
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="secondary"
            className="h-7 px-2.5 text-xs"
            onClick={onRetry}
          >
            Retry
          </Button>
          <Button type="button" variant="ghost" className="h-7 px-2.5 text-xs" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

/** Thin bar across the top of a queue bar: finished share of the listed jobs. */
export function ProgressLine({ progress }: { progress: Progress }) {
  if (!progress.total) return null;
  const settled = progress.done + progress.failed;
  return (
    <div className="h-0.5 w-full bg-zinc-100">
      <div
        className={cn("h-full transition-all", progress.failed ? "bg-red-500" : "bg-zinc-900")}
        style={{ width: `${(settled / progress.total) * 100}%` }}
      />
    </div>
  );
}

/** "Generating 3/12 images · 1 failed" or "Done 12/12 images". */
export function RunSummary({ progress }: { progress: Progress }) {
  return (
    <span className="inline-flex items-center gap-2">
      {progress.active && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
      <span className="font-medium text-zinc-900">{progress.active ? "Generating" : "Done"}</span>
      <span className="tabular-nums text-zinc-500">
        {progress.done}/{progress.total} images
      </span>
      {progress.failed > 0 && <span className="text-red-600">· {progress.failed} failed</span>}
    </span>
  );
}

/**
 * Cancel while jobs wait; once nothing runs, retry the failed ones or clear the finished runs.
 * Jobs run on the server, so these act on runs started from any page or tab.
 */
export function RunActions({
  progress,
  onCancel,
  onRetry,
  onDismiss,
}: {
  progress: Progress;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (!progress.total) return null;
  if (progress.active) {
    return (
      <Button type="button" variant="secondary" className="h-8 py-0" onClick={onCancel}>
        Cancel waiting
      </Button>
    );
  }
  return (
    <>
      {progress.failed > 0 && (
        <Button type="button" variant="secondary" className="h-8 py-0" onClick={onRetry}>
          Retry {progress.failed} failed
        </Button>
      )}
      <Button type="button" variant="ghost" className="h-8 py-0" onClick={onDismiss}>
        Dismiss
      </Button>
    </>
  );
}
