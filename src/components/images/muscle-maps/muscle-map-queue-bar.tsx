"use client";

import { X } from "lucide-react";
import { CropToggles, ViewToggles } from "@/components/images/generation-controls";
import { ProgressLine, RunActions, RunSummary } from "@/components/images/run-status";
import { Button } from "@/components/ui/primitives";
import type { jobProgress } from "@/hooks/use-generation-jobs";
import type { GenerationJob } from "@/lib/images/job-types";
import { jobSlot } from "@/lib/images/job-types";
import type { MuscleMapCrop, MuscleMapView } from "@/lib/images/types";
import { muscleMapSlotLabel } from "@/lib/images/types";
import { cn } from "@/lib/utils";

/**
 * The Muscle maps board's bottom bar: the selection and which views and crops to generate, and the
 * server-side runs of this style (progress, maps being made or failed, cancel / retry / dismiss).
 */
export function MuscleMapQueueBar({
  selectedCount,
  onClearSelection,
  plannedImages,
  missingBases,
  views,
  onViewsChange,
  crops,
  onCropsChange,
  jobs,
  progress,
  nameOf,
  onGenerate,
  onCancel,
  onRetry,
  onDismiss,
}: {
  selectedCount: number;
  onClearSelection: () => void;
  plannedImages: number;
  /** Labels of the chosen view × crop maps the style has no base for (they are skipped). */
  missingBases: string[];
  views: MuscleMapView[];
  onViewsChange: (next: MuscleMapView[]) => void;
  crops: MuscleMapCrop[];
  onCropsChange: (next: MuscleMapCrop[]) => void;
  jobs: GenerationJob[];
  progress: ReturnType<typeof jobProgress>;
  nameOf: (job: GenerationJob) => string;
  onGenerate: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (selectedCount === 0 && progress.total === 0) return null;

  const visible = jobs.filter((j) => j.status === "running" || j.status === "error");
  const slotLabel = (job: GenerationJob) => {
    const slot = jobSlot(job);
    return slot ? muscleMapSlotLabel(slot) : null;
  };

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
              {missingBases.length > 0 && (
                <span
                  className="text-amber-700"
                  title="Maps edit the style's base of their view and crop"
                >
                  · no {missingBases.join(" / ")} base
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
              <ViewToggles value={views} onChange={onViewsChange} />
              <CropToggles value={crops} onChange={onCropsChange} />
              <Button
                type="button"
                className="h-8 py-0"
                onClick={onGenerate}
                disabled={plannedImages === 0}
              >
                {plannedImages > 0 ? `Generate ${plannedImages}` : "Generate"}
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
            {visible.map((job) => (
              <div key={job.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {nameOf(job)}
                  {slotLabel(job) && <span className="text-zinc-400"> · {slotLabel(job)}</span>}
                </span>
                <span
                  title={job.error ?? undefined}
                  className={cn(
                    "truncate",
                    job.status === "error" ? "text-red-600" : "font-medium text-zinc-900",
                  )}
                >
                  {job.status === "error" ? job.error : "⟳"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
