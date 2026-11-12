"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Info, ListChecks, RotateCw, X } from "lucide-react";
import { formatDuration, jobsSummary, type JobAction, type JobCounts, type StudioJob } from "@/lib/studio/jobs";
import { useStageView } from "@/lib/studio/stage-view";
import { cn } from "@/lib/utils";
import type { QueueDriver } from "../hooks/use-worker-driver";
import { JobRow } from "./job-row";

/**
 * The stage changes width when the tray docks beside it or leaves: once the canvas has its new size (the 3D
 * view resizes a frame or two after the layout), the body is fitted again from the view the camera
 * is on (the same request as pressing that view).
 */
function refitStageSoon() {
  const started = performance.now();
  const step = () => {
    const canvas = document.querySelector<HTMLCanvasElement>(".studio-stage canvas");
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    const resized = Math.abs(canvas.getBoundingClientRect().width - box.getBoundingClientRect().width) < 2;
    if (!resized && performance.now() - started < 1500) {
      requestAnimationFrame(step);
      return;
    }
    const view = useStageView.getState();
    if (view.current) view.showView(view.current);
    else view.frame();
  };
  requestAnimationFrame(() => requestAnimationFrame(step));
}

function Group({
  title,
  jobs,
  action,
  ...row
}: {
  title: string;
  jobs: StudioJob[];
  /** A button at the end of the heading (Clear for the finished ones). */
  action?: React.ReactNode;
  now: number;
  busy: string | null;
  errors: Record<string, string>;
  onAction: (job: StudioJob, action: JobAction) => void;
}) {
  const id = useId();
  if (!jobs.length) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-(--studio-space-2)">
      <div className="flex items-center gap-2 px-1">
        <h3 id={id} className="flex items-center gap-2 text-(length:--studio-text-2xs) font-semibold uppercase tracking-[0.14em] text-(--m3-on-surface-variant)">
          {title}
          <span className="rounded-full bg-(--m3-surface-container-highest) px-1.5 py-px font-mono text-(length:--studio-text-2xs) tracking-normal text-(--m3-on-surface)">{jobs.length}</span>
        </h3>
        {action ? <span className="ml-auto">{action}</span> : null}
      </div>
      <ul className="flex flex-col gap-(--studio-space-2)">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} now={row.now} busy={row.busy === job.id} error={row.errors[job.id]} onAction={row.onAction} />
        ))}
      </ul>
    </section>
  );
}

/** The queue is not advancing: the reason, how often it is tried, and a way to try now. */
function StalledBanner({ queue }: { queue: QueueDriver }) {
  const [trying, setTrying] = useState(false);
  return (
    <div role="alert" data-queue-stalled className="mx-(--studio-space-3) mt-(--studio-space-3) rounded-(--studio-radius-md) border border-(--m3-error)/40 bg-(--m3-error-container)/55 p-(--studio-space-3)">
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-(--m3-error)" />
        <div className="min-w-0 flex-1">
          <p className="text-(length:--studio-text-sm) font-semibold text-(--m3-on-surface)">The queue is not advancing</p>
          <p className="mt-1 break-words text-(length:--studio-text-xs) leading-relaxed text-(--m3-error)">{queue.error ?? "The worker request keeps failing."}</p>
          <p className="mt-1 text-(length:--studio-text-xs) text-(--m3-on-surface-variant)">
            Queued AI movements wait until it works again. Tried again every {formatDuration(queue.delayMs)}.
          </p>
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={trying}
          onClick={() => {
            setTrying(true);
            void queue.retry().finally(() => setTrying(false));
          }}
          className="studio-state inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full bg-(--m3-secondary-container) px-3 text-(length:--studio-text-xs) font-medium text-(--m3-on-secondary-container) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70 disabled:cursor-wait disabled:opacity-60"
        >
          <RotateCw aria-hidden className={cn("h-3 w-3", trying && "motion-safe:animate-spin")} />
          {trying ? "Trying…" : "Try again now"}
        </button>
      </div>
    </div>
  );
}

/**
 * The jobs tray: every background job in one list, grouped by what it needs from you. The shell
 * docks it beside the stage, or in the catalog's place when the stage has no room to spare: the
 * stage is never covered, so the body, its points and the pose editor all stay in reach. No
 * backdrop, no focus trap; Escape or the close button hide it and give focus back to its top-bar
 * button.
 */
export function JobsTray({
  jobs,
  counts,
  queue,
  now,
  busy,
  errors,
  onAction,
  onDismissFinished,
  onClose,
}: {
  jobs: StudioJob[];
  counts: JobCounts;
  queue: QueueDriver;
  now: number;
  busy: string | null;
  errors: Record<string, string>;
  onAction: (job: StudioJob, action: JobAction) => void;
  onDismissFinished: () => void;
  onClose: (refocus: boolean) => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  // Opening moves focus into the tray (it is far from its button in reading order). When the shell
  // narrowed the stage for it (beside the stage), the stage fits the body again, and again once it
  // widens back on close; in the place of the catalog the stage keeps its size and its camera.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    const resizes = panel.current?.closest("[data-side-panel]")?.getAttribute("data-resizes-stage") !== "false";
    if (!resizes) return;
    refitStageSoon();
    return refitStageSoon;
  }, []);
  const stalled = queue.status === "stalled";
  const row = { now, busy, errors, onAction };

  return (
    <section
      ref={panel}
      id="studio-jobs-tray"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-jobs-tray
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
      }}
      // It fills the column the shell gives it (beside the stage, or in the catalog's place): never over the stage.
      className="@container/tray flex h-full min-h-0 w-full min-w-0 flex-col bg-(--m3-surface-container-low) text-(--m3-on-surface) outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--m3-primary)/60"
    >
      <header className="flex items-center gap-(--studio-space-2) border-b border-(--m3-outline-variant) px-(--studio-space-4) py-(--studio-space-3)">
        <ListChecks aria-hidden className="h-4 w-4 text-(--m3-primary)" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-(length:--studio-text-sm) font-semibold tracking-tight">
            Jobs
          </h2>
          {counts.total ? <p className="truncate text-(length:--studio-text-xs) text-(--m3-on-surface-variant)">{jobsSummary(counts)}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => onClose(true)}
          aria-label="Close jobs"
          className="studio-state flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-(--m3-on-surface-variant) outline-none hover:text-(--m3-on-surface) focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {stalled ? <StalledBanner queue={queue} /> : null}

      <div className="studio-scroll min-h-0 flex-1 overflow-y-auto p-(--studio-space-3)">
        {jobs.length ? (
          <div className="flex flex-col gap-(--studio-space-4)">
            <Group title="Needs attention" jobs={jobs.filter((j) => j.state === "failed")} {...row} />
            <Group title="In progress" jobs={jobs.filter((j) => j.state === "running" || j.state === "queued")} {...row} />
            <Group
              title="Finished"
              jobs={jobs.filter((j) => j.state === "done")}
              action={
                <button
                  type="button"
                  onClick={onDismissFinished}
                  className="studio-state -my-1 inline-flex h-6 cursor-pointer items-center rounded-full px-2 text-(length:--studio-text-xs) font-medium text-(--m3-primary) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
                >
                  Clear finished
                </button>
              }
              {...row}
            />
          </div>
        ) : (
          <div className="px-(--studio-space-3) py-(--studio-space-4) text-center">
            <p className="text-(length:--studio-text-sm) font-medium">No jobs right now</p>
            <p className="mt-1 text-(length:--studio-text-xs) leading-relaxed text-(--m3-on-surface-variant)">
              AI movements you queue and avatar or equipment builds show here while they run, and stay for a day after they finish.
            </p>
          </div>
        )}
      </div>

      <footer className="flex items-start gap-2 border-t border-(--m3-outline-variant) px-(--studio-space-4) py-(--studio-space-3)">
        <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-(--m3-on-surface-variant)" />
        <p className="min-w-0 flex-1 text-(length:--studio-text-xs) leading-relaxed text-(--m3-on-surface-variant)">
          Jobs advance only while a Studio tab is open (this tab runs them). Close every Studio tab and they wait.
        </p>
      </footer>
    </section>
  );
}
