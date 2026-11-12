"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ListChecks, Loader2 } from "lucide-react";
import { jobAnnouncements, jobCounts, jobStates, jobsButtonLabel, newlyFinished, type JobState } from "@/lib/studio/jobs";
import type { BaseAvatar, MovementVector, StudioEquipment, StudioExercise } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import type { QueueDriver } from "../hooks/use-worker-driver";
import { JobsTray } from "./jobs-tray";
import { useJobsTray } from "./jobs-tray-store";
import { useJobActions, type JobHandlers } from "./use-job-actions";
import { useNow, useStudioJobs } from "./use-studio-jobs";

export { useJobsTray };

/**
 * Where the tray renders: the shell's side-panel slot (beside the stage, or in the catalog's place
 * when the stage has no room to spare). It fills the column the shell gives it; closed, it takes
 * no room.
 */
export function JobsSlot() {
  const setSlot = useJobsTray((s) => s.setSlot);
  // Registered only inside the column the shell opened for it, so the tray mounts once, in its place.
  const register = useCallback((el: HTMLDivElement | null) => setSlot(el?.parentElement?.hasAttribute("data-side-panel") ? el : null), [setSlot]);
  return <div ref={register} data-jobs-slot className="contents" />;
}

/** What the button and the announcer remember between two lists. */
type Seen = { signature: string; states: Map<string, JobState> | null; message: string; unseen: string[] };

/**
 * The jobs button of the top bar (how many run, how many need attention, what finished since you
 * last looked), its tray and the polite live region that announces job changes. Everything that
 * ticks (elapsed times) re-renders this component only, never the workspace or the stage.
 */
export function JobsCenter({
  exercises,
  exerciseId,
  vectors,
  avatars,
  equipment,
  currentAvatarId,
  defaultModel,
  ready,
  queue,
  ...handlers
}: JobHandlers & {
  exercises: StudioExercise[];
  exerciseId: string | null;
  vectors: MovementVector[];
  avatars: BaseAvatar[];
  equipment: StudioEquipment[];
  currentAvatarId: string | null;
  /** The pipeline model of the Studio settings, named when a retried AI movement asks first. */
  defaultModel: string | null;
  /** The avatars and equipment lists have answered: before that, nothing is announced. */
  ready: boolean;
  queue: QueueDriver;
}) {
  const open = useJobsTray((s) => s.open);
  const setOpen = useJobsTray((s) => s.setOpen);
  const slot = useJobsTray((s) => s.slot);
  const button = useRef<HTMLButtonElement>(null);
  const stalled = queue.status === "stalled";
  const [fast, setFast] = useState(false);
  const now = useNow(fast);
  const { jobs, dismiss, refreshOthers } = useStudioJobs({ exercises, exerciseId, vectors, avatars, equipment, currentAvatarId, stalled, now });
  const actions = useJobActions({
    ...handlers,
    // A retried or stopped AI movement of another exercise lives in the tray's own list: refresh it too.
    onChanged: (kind) => {
      handlers.onChanged(kind);
      if (kind === "generation") void refreshOthers();
    },
    avatars,
    defaultModel,
    dismiss,
  });
  const counts = jobCounts(jobs);

  // Elapsed times tick every second only while the tray shows something running.
  const wantFast = open && counts.active > 0;
  if (wantFast !== fast) setFast(wantFast);

  // Announce what changed since the previous list, and mark what finished while the tray was closed.
  const signature = jobs.map((j) => `${j.id}:${j.state}`).join("|");
  const [seen, setSeen] = useState<Seen>({ signature: "", states: null, message: "", unseen: [] });
  if (ready && signature !== seen.signature) {
    const said = jobAnnouncements(seen.states, jobs);
    const finished = open ? [] : newlyFinished(seen.states, jobs);
    setSeen({
      signature,
      states: jobStates(jobs),
      message: said.length ? said.join(" ") : seen.message,
      unseen: [...new Set([...seen.unseen, ...finished])].filter((id) => jobs.some((j) => j.id === id)),
    });
  }
  const unseenDone = seen.unseen.filter((id) => jobs.some((j) => j.id === id && j.state === "done")).length;

  const toggle = () => {
    if (!open) setSeen((s) => ({ ...s, unseen: [] }));
    setOpen(!open);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const attention = counts.failed + (stalled ? 1 : 0);
  const label = jobsButtonLabel(counts, stalled);
  return (
    <>
      <button
        ref={button}
        type="button"
        data-jobs-button
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? "studio-jobs-tray" : undefined}
        data-tip={label}
        onClick={toggle}
        className={cn(
          "studio-state studio-tip inline-flex h-(--studio-control-md) shrink-0 cursor-pointer items-center gap-(--studio-space-2) rounded-(--studio-radius-md) border px-(--studio-space-2) text-(length:--studio-text-xs) font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70",
          open ? "border-transparent bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "border-(--m3-outline-variant) text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)",
        )}
      >
        {/* A spinner only while work really advances: a stalled queue shows a warning instead. */}
        {stalled ? (
          <AlertTriangle aria-hidden className="h-4 w-4 text-(--m3-error)" />
        ) : counts.active ? (
          <Loader2 aria-hidden className="h-4 w-4 text-(--m3-primary) motion-safe:animate-spin" />
        ) : (
          <ListChecks aria-hidden className="h-4 w-4" />
        )}
        <span className="hidden xl:inline">Jobs</span>
        {counts.active ? (
          <span aria-hidden className="min-w-5 rounded-full bg-(--m3-primary-container) px-1.5 py-px text-center text-(length:--studio-text-2xs) font-semibold tabular-nums text-(--m3-on-primary-container)">
            {counts.active}
          </span>
        ) : null}
        {attention ? (
          <span aria-hidden className="min-w-5 rounded-full bg-(--m3-error-container) px-1.5 py-px text-center text-(length:--studio-text-2xs) font-semibold tabular-nums text-(--m3-error) ring-1 ring-(--m3-error)/50">
            {stalled && !counts.failed ? "!" : counts.failed}
          </span>
        ) : null}
        {unseenDone && !attention ? (
          <span aria-hidden className="inline-flex items-center gap-0.5 rounded-full bg-(--m3-tertiary-container) px-1.5 py-px text-(length:--studio-text-2xs) font-semibold text-(--m3-success)">
            <CheckCircle2 className="h-3 w-3" />
            {unseenDone}
          </span>
        ) : null}
      </button>
      <div role="status" aria-live="polite" className="sr-only" data-jobs-live>
        {seen.message}
      </div>
      {open && slot
        ? createPortal(
            <JobsTray
              jobs={jobs}
              counts={counts}
              queue={queue}
              now={now}
              busy={actions.busy}
              errors={actions.errors}
              onAction={(job, action) => void actions.run(job, action)}
              onDismissFinished={() => dismiss(jobs.filter((j) => j.state === "done").map((j) => j.id))}
              onClose={close}
            />,
            slot,
          )
        : null}
    </>
  );
}
