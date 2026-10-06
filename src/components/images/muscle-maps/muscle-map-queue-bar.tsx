"use client";

import { Loader2, X } from "lucide-react";
import { ViewToggles } from "@/components/images/generation-controls";
import { Button } from "@/components/ui/primitives";
import type { MuscleMapQueueItem } from "@/hooks/use-muscle-map-queue";
import type { MuscleMapView } from "@/lib/images/types";
import { cn } from "@/lib/utils";
import { VIEW_LABEL } from "./muscle-map-card";

export function MuscleMapQueueBar({
  selectedCount,
  onClearSelection,
  plannedImages,
  missingBases,
  views,
  onViewsChange,
  running,
  items,
  done,
  total,
  errors,
  onGenerate,
  onCancel,
}: {
  selectedCount: number;
  onClearSelection: () => void;
  plannedImages: number;
  /** Selected views the style has no base for (they are skipped). */
  missingBases: MuscleMapView[];
  views: MuscleMapView[];
  onViewsChange: (next: MuscleMapView[]) => void;
  running: boolean;
  items: MuscleMapQueueItem[];
  done: number;
  total: number;
  errors: number;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  if (selectedCount === 0 && !running && items.length === 0) return null;

  const showProgress = running || items.length > 0;
  const visible = items.filter((i) => i.status === "processing" || i.status === "error");

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.12)] backdrop-blur-sm">
      {showProgress && total > 0 && (
        <div className="h-0.5 w-full bg-zinc-100">
          <div
            className={cn("h-full transition-all", errors ? "bg-red-500" : "bg-zinc-900")}
            style={{ width: `${((done + errors) / total) * 100}%` }}
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
                {done}/{total} maps
              </span>
              {errors > 0 && <span className="text-red-600">· {errors} failed</span>}
            </>
          ) : (
            <>
              <span className="font-medium tabular-nums text-zinc-900">
                {selectedCount} selected
              </span>
              {missingBases.length > 0 && (
                <span className="text-amber-700" title="Maps edit the style's base of each view">
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
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ViewToggles value={views} onChange={onViewsChange} disabled={running} />
          {running ? (
            <Button type="button" variant="secondary" className="h-8 py-0" onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              className="h-8 py-0"
              onClick={onGenerate}
              disabled={selectedCount === 0 || plannedImages === 0}
            >
              {plannedImages > 0 ? `Generate ${plannedImages}` : "Generate"}
            </Button>
          )}
        </div>
      </div>
      {visible.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pb-3">
          <div className="max-h-32 space-y-1 overflow-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-xs text-zinc-600">
            {visible.map((item) => (
              <div key={item.key} className="flex justify-between gap-2">
                <span className="truncate">
                  {item.name}
                  <span className="text-zinc-400"> · {VIEW_LABEL[item.view]}</span>
                </span>
                <span
                  title={item.error}
                  className={cn(
                    "truncate",
                    item.status === "error" ? "text-red-600" : "font-medium text-zinc-900",
                  )}
                >
                  {item.status === "error" ? item.error : "⟳"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
