"use client";

import { Button } from "@/components/ui/primitives";
import { StepTrail } from "@/components/images/generation-progress";
import { PositionSelector, SubjectSelector } from "@/components/images/position-selector";
import type { QueueItem } from "@/hooks/use-generation-queue";
import type { SubjectChoice } from "@/lib/images/types";

export function GenerationQueueBar({
  selectedCount,
  positions,
  onPositionsChange,
  subject,
  onSubjectChange,
  running,
  items,
  exercisesDone,
  imagesDone,
  imagesTotal,
  errors,
  onGenerate,
  onCancel,
}: {
  selectedCount: number;
  positions: number[];
  onPositionsChange: (next: number[]) => void;
  subject: SubjectChoice;
  onSubjectChange: (next: SubjectChoice) => void;
  running: boolean;
  items: QueueItem[];
  exercisesDone: number;
  imagesDone: number;
  imagesTotal: number;
  errors: number;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  if (selectedCount === 0 && !running && items.length === 0) return null;

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
            <span>{selectedCount} selected</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubjectSelector value={subject} onChange={onSubjectChange} disabled={running} />
          <PositionSelector value={positions} onChange={onPositionsChange} disabled={running} />
          {running ? (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel queue
            </Button>
          ) : (
            <Button type="button" onClick={onGenerate} disabled={selectedCount === 0}>
              Generate {selectedCount > 0 ? `${selectedCount} × ${positions.length}` : ""}
            </Button>
          )}
        </div>
      </div>
      {visible.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pb-3">
          <div className="max-h-32 space-y-1 overflow-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-xs text-zinc-600">
            {visible.map((item) => (
              <div key={item.exoId} className="flex justify-between gap-2">
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
