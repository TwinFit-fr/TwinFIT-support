"use client";

import { memo } from "react";
import { AlertCircle, CheckCircle2, Clock3, Dumbbell, Loader2, Sparkles, UserRound } from "lucide-react";
import { JOB_STATE_LABEL, jobTiming, type JobAction, type JobKind, type JobState, type StudioJob } from "@/lib/studio/jobs";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<JobKind, React.ReactNode> = {
  generation: <Sparkles className="h-4 w-4" />,
  avatar: <UserRound className="h-4 w-4" />,
  equipment: <Dumbbell className="h-4 w-4" />,
};

const STATE_STYLE: Record<JobState, { chip: string; icon: React.ReactNode }> = {
  queued: { chip: "border-(--m3-outline) text-(--m3-on-surface-variant)", icon: <Clock3 className="h-3 w-3" /> },
  running: { chip: "border-(--m3-primary)/40 bg-(--m3-primary)/10 text-(--m3-primary)", icon: <Loader2 className="h-3 w-3 motion-safe:animate-spin" /> },
  done: { chip: "border-(--m3-success)/40 bg-(--m3-success)/10 text-(--m3-success)", icon: <CheckCircle2 className="h-3 w-3" /> },
  failed: { chip: "border-(--m3-error)/50 bg-(--m3-error)/10 text-(--m3-error)", icon: <AlertCircle className="h-3 w-3" /> },
};

function actionLabel(job: StudioJob, action: JobAction): string {
  if (action === "open") return job.openLabel ?? "Open";
  if (action === "use") return "Use this avatar";
  if (action === "retry") return job.paidRetry ? "Retry…" : "Retry";
  if (action === "stop") return "Stop";
  return "Dismiss";
}

/** The action that answers the job's state best is the tonal one; the rest are text buttons. */
function primaryAction(job: StudioJob): JobAction | null {
  if (job.state === "failed" && job.actions.includes("retry")) return "retry";
  if (job.state === "done") return job.actions.includes("use") ? "use" : job.actions.includes("open") ? "open" : null;
  return null;
}

/** One job: what it is and for what, its state and step, how long it has been going, the whole failure reason, honest actions. */
export const JobRow = memo(function JobRow({
  job,
  now,
  busy,
  error,
  onAction,
}: {
  job: StudioJob;
  now: number;
  busy: boolean;
  error?: string;
  onAction: (job: StudioJob, action: JobAction) => void;
}) {
  const style = STATE_STYLE[job.state];
  const primary = primaryAction(job);
  return (
    <li
      data-job={job.id}
      data-job-state={job.state}
      className={cn(
        "rounded-(--studio-radius-md) border bg-(--m3-surface-container-low) p-(--studio-space-3)",
        job.state === "failed" ? "border-(--m3-error)/35" : "border-(--m3-outline-variant)",
      )}
    >
      <div className="flex items-start gap-(--studio-space-3)">
        {/* The kind icon gives its room to the words when the tray holds the catalog's narrow place. */}
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-(--studio-radius-sm) @max-[300px]/tray:hidden",
            job.state === "failed" ? "bg-(--m3-error-container) text-(--m3-error)" : "bg-(--m3-surface-container-highest) text-(--m3-on-surface-variant)",
          )}
        >
          {KIND_ICON[job.kind]}
        </span>
        <div className="min-w-0 flex-1">
          {/* What it is and its state on one line; what it is for gets the whole width under them. */}
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-(length:--studio-text-2xs) font-semibold uppercase tracking-[0.12em] text-(--m3-on-surface-variant)">{job.what}</p>
            <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-(length:--studio-text-2xs) font-semibold", style.chip)}>
              {style.icon}
              {JOB_STATE_LABEL[job.state]}
            </span>
          </div>
          <p className="break-words text-(length:--studio-text-sm) font-medium leading-snug text-(--m3-on-surface)">{job.subject}</p>

          {job.state === "failed" ? (
            <p className="mt-1.5 whitespace-pre-wrap break-words rounded-(--studio-radius-sm) bg-(--m3-error-container)/60 px-2.5 py-1.5 text-(length:--studio-text-xs) leading-snug text-(--m3-error) select-text">
              {job.step}
            </p>
          ) : (
            <p className="mt-1 text-(length:--studio-text-xs) leading-snug text-(--m3-on-surface)">{job.step}</p>
          )}

          {job.state === "running" ? (
            <div
              role="progressbar"
              aria-label={`${job.what} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={job.progress ?? undefined}
              aria-valuetext={job.progress === null ? "In progress, no percentage reported" : `${job.progress}%`}
              className="mt-2 h-1 overflow-hidden rounded-full bg-(--m3-surface-container-highest)"
            >
              {job.progress === null ? (
                <div className="studio-indeterminate h-full w-1/3 rounded-full bg-(--m3-primary)" />
              ) : (
                <div className="h-full rounded-full bg-(--m3-primary) transition-[width] duration-500" style={{ width: `${Math.max(3, job.progress)}%` }} />
              )}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-1.5 text-(length:--studio-text-xs) text-(--m3-error)">
              {error}
            </p>
          ) : null}

          {/* How long it has been going, then the actions, on one line (they wrap under it when the tray is narrow). */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1">
            <p className="mr-auto min-w-0 text-(length:--studio-text-2xs) tabular-nums text-(--m3-on-surface-variant)">
              {jobTiming(job, now)}
            </p>
            {job.actions.length ? (
              <div className="-mr-1 flex flex-wrap items-center gap-0.5">
                {job.actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={busy}
                    data-job-action={action}
                    aria-label={`${actionLabel(job, action).replace("…", "")}: ${job.what} for ${job.subject}`}
                    onClick={() => onAction(job, action)}
                    className={cn(
                      "studio-state inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-(length:--studio-text-xs) font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70 disabled:cursor-wait disabled:opacity-50",
                      action === primary
                        ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)"
                        : action === "dismiss"
                          ? "text-(--m3-on-surface-variant)"
                          : "text-(--m3-primary)",
                    )}
                  >
                    {busy && action === primary ? <Loader2 aria-hidden className="h-3 w-3 motion-safe:animate-spin" /> : null}
                    {actionLabel(job, action)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
});
