"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { StepTrail } from "@/components/images/generation-progress";
import {
  PositionToggles,
  SequenceLengthControl,
  SubjectToggles,
} from "@/components/images/generation-controls";
import { ProgressLine, RunActions, RunSummary } from "@/components/images/run-status";
import type { QueueItem, jobProgress } from "@/hooks/use-generation-jobs";
import type { FrameCountChoice, Subject } from "@/lib/images/types";

/**
 * The Exercises board's bottom bar: the selection and how to generate it, and the server-side
 * runs of this style (progress, the frames being made or failed, cancel / retry / dismiss).
 * More runs can be queued while one is in progress.
 */
export function GenerationQueueBar({
  selectedCount,
  onClearSelection,
  plannedImages,
  withoutStart,
  frameCount,
  onFrameCountChange,
  positions,
  availablePositions,
  onPositionsChange,
  subjects,
  onSubjectsChange,
  preparing,
  items,
  progress,
  nameOf,
  onGenerate,
  onCancel,
  onRetry,
  onDismiss,
}: {
  selectedCount: number;
  onClearSelection: () => void;
  /** Images the next run will generate for the selection. */
  plannedImages: number;
  /** Selected exercises left out because the run has no Start and they have no active one. */
  withoutStart: number;
  frameCount: FrameCountChoice;
  onFrameCountChange: (next: FrameCountChoice) => void;
  positions: number[];
  availablePositions?: number[];
  onPositionsChange: (next: number[]) => void;
  subjects: Subject[];
  onSubjectsChange: (next: Subject[]) => void;
  /** Saving the batch frame count before the run is queued. */
  preparing: boolean;
  items: QueueItem[];
  progress: ReturnType<typeof jobProgress>;
  nameOf: (exoId: number) => string;
  onGenerate: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (selectedCount === 0 && progress.total === 0) return null;

  const visible = items.filter(
    (i) => i.status === "processing" || i.steps.some((s) => s.status === "error"),
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.12)] backdrop-blur-sm">
      <ProgressLine progress={progress} />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-700"
          role="status"
          aria-live="polite"
        >
          {progress.total > 0 && <RunSummary progress={progress} />}
          {selectedCount > 0 && (
            <span className="inline-flex items-center gap-2">
              <span className="font-medium tabular-nums text-zinc-900">
                {selectedCount} selected
              </span>
              {withoutStart > 0 && (
                <span
                  className="text-amber-700"
                  title="Mid/End are edits of the Start: generate Start first"
                >
                  · {withoutStart} skipped, no Start
                </span>
              )}
              <button
                type="button"
                onClick={onClearSelection}
                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Clear selection"
                title="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {selectedCount > 0 && (
            <>
              <SubjectToggles value={subjects} onChange={onSubjectsChange} disabled={preparing} />
              <SequenceLengthControl
                perExercise
                value={frameCount}
                onChange={onFrameCountChange}
                disabled={preparing}
              />
              <PositionToggles
                value={positions}
                available={availablePositions}
                onChange={onPositionsChange}
                disabled={preparing}
              />
              <Button
                type="button"
                className="h-8 py-0"
                onClick={onGenerate}
                disabled={preparing || plannedImages === 0}
              >
                {preparing
                  ? "Saving…"
                  : plannedImages > 0
                    ? `Generate ${plannedImages}`
                    : "Generate"}
              </Button>
            </>
          )}
          <RunActions
            progress={progress}
            onCancel={onCancel}
            onRetry={onRetry}
            onDismiss={onDismiss}
          />
        </div>
      </div>
      {visible.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pb-3">
          <div className="max-h-32 space-y-1 overflow-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-xs text-zinc-600">
            {visible.map((item) => (
              <div
                key={`${item.batchId}-${item.exoId}-${item.subject}`}
                className="flex justify-between gap-2"
              >
                <span className="truncate">
                  <span className="tabular-nums text-zinc-400">#{item.exoId}</span>{" "}
                  {nameOf(item.exoId)}
                  <span className="text-zinc-400"> · {item.subject}</span>
                </span>
                <StepTrail steps={item.steps} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
