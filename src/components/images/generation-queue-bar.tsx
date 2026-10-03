"use client";

import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { StepTrail } from "@/components/images/generation-progress";
import {
  FrameCountSelector,
  PositionSelector,
  SubjectSelector,
} from "@/components/images/position-selector";
import { SystemPromptSelect } from "@/components/images/prompt-overrides";
import type { QueueItem } from "@/hooks/use-generation-queue";
import type { FrameCountChoice, Subject } from "@/lib/images/types";
import { cn } from "@/lib/utils";

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
  systemPrompts,
  settingsSystemPromptId,
  systemPromptId,
  onSystemPromptChange,
  running,
  preparing,
  items,
  exercisesDone,
  imagesDone,
  imagesTotal,
  errors,
  onGenerate,
  onCancel,
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
  systemPrompts: { id: string }[];
  settingsSystemPromptId: string | null | undefined;
  systemPromptId: string | undefined;
  onSystemPromptChange: (next: string | undefined) => void;
  running: boolean;
  /** Saving the batch frame count before the queue starts. */
  preparing: boolean;
  items: QueueItem[];
  exercisesDone: number;
  imagesDone: number;
  imagesTotal: number;
  errors: number;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  if (selectedCount === 0 && !running && items.length === 0) return null;

  const locked = running || preparing;
  const total = items.length;
  const showProgress = running || items.length > 0;
  const visible = items.filter(
    (i) => i.status === "processing" || i.steps.some((s) => s.status === "error"),
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.12)] backdrop-blur-sm">
      {showProgress && imagesTotal > 0 && (
        <div className="h-0.5 w-full bg-zinc-100">
          <div
            className={cn("h-full transition-all", errors ? "bg-red-500" : "bg-zinc-900")}
            style={{ width: `${(imagesDone / imagesTotal) * 100}%` }}
          />
        </div>
      )}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div
          className="flex items-center gap-2 text-sm text-zinc-700"
          role="status"
          aria-live="polite"
        >
          {showProgress ? (
            <>
              {running && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
              <span className="font-medium text-zinc-900">{running ? "Generating" : "Done"}</span>
              <span className="tabular-nums text-zinc-500">
                {exercisesDone}/{total} exercises · {imagesDone}/{imagesTotal} images
              </span>
              {errors > 0 && <span className="text-red-600">· {errors} failed</span>}
            </>
          ) : (
            <>
              <span className="font-medium text-zinc-900 tabular-nums">
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
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {systemPrompts.length > 1 && (
            <SystemPromptSelect
              label="Prompt"
              prompts={systemPrompts}
              settingsPromptId={settingsSystemPromptId}
              value={systemPromptId}
              onChange={onSystemPromptChange}
              disabled={locked}
            />
          )}
          <SubjectSelector value={subjects} onChange={onSubjectsChange} disabled={locked} />
          <FrameCountSelector value={frameCount} onChange={onFrameCountChange} disabled={locked} />
          <PositionSelector
            value={positions}
            available={availablePositions}
            onChange={onPositionsChange}
            disabled={locked}
          />
          {running ? (
            <Button type="button" variant="secondary" className="h-8 py-0" onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              className="h-8 py-0"
              onClick={onGenerate}
              disabled={preparing || selectedCount === 0 || plannedImages === 0}
            >
              {preparing ? "Saving…" : plannedImages > 0 ? `Generate ${plannedImages}` : "Generate"}
            </Button>
          )}
        </div>
      </div>
      {visible.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pb-3">
          <div className="max-h-32 space-y-1 overflow-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-xs text-zinc-600">
            {visible.map((item) => (
              <div key={`${item.exoId}-${item.subject}`} className="flex justify-between gap-2">
                <span className="truncate">
                  <span className="tabular-nums text-zinc-400">#{item.exoId}</span> {item.name}
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
