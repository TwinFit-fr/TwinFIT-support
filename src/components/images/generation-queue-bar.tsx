"use client";

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

export function GenerationQueueBar({
  selectedCount,
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
  const visible = items.filter(
    (i) => i.status === "processing" || i.steps.some((s) => s.status === "error"),
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="text-sm text-zinc-700" role="status" aria-live="polite">
          {running || items.length > 0 ? (
            <span>
              {running ? "Generating" : "Finished"} · exercises {exercisesDone}/{total} · images{" "}
              {imagesDone}/{imagesTotal}
              {errors ? <span className="text-red-600"> · {errors} error(s)</span> : null}
            </span>
          ) : (
            <span>
              {selectedCount} selected
              {withoutStart > 0 && (
                <span className="text-amber-700">
                  {" "}
                  · {withoutStart} without Start skipped (generate Start first)
                </span>
              )}
            </span>
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
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel queue
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onGenerate}
              disabled={preparing || selectedCount === 0 || plannedImages === 0}
            >
              {preparing
                ? "Saving frames…"
                : plannedImages > 0
                  ? `Generate ${plannedImages} image${plannedImages === 1 ? "" : "s"}`
                  : "Generate"}
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
                  {item.status === "processing" ? "Generating exercise" : "Exercise"}{" "}
                  {item.ordinal}/{total} · #{item.exoId} {item.name} ({item.subject})
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
