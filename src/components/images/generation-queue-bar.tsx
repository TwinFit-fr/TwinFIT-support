"use client";

import { Button } from "@/components/ui/primitives";
import type { QueueItem } from "@/hooks/use-generation-queue";

export function GenerationQueueBar({
  selectedCount,
  running,
  items,
  done,
  total,
  onGenerate,
  onCancel,
}: {
  selectedCount: number;
  running: boolean;
  items: QueueItem[];
  done: number;
  total: number;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  if (selectedCount === 0 && !running && items.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="text-sm text-zinc-700">
          {running || items.length > 0 ? (
            <span>
              Queue {done}/{total}
              {items.some((i) => i.status === "error")
                ? ` · ${items.filter((i) => i.status === "error").length} error(s)`
                : ""}
            </span>
          ) : (
            <span>{selectedCount} selected</span>
          )}
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel queue
            </Button>
          ) : (
            <Button type="button" onClick={onGenerate} disabled={selectedCount === 0}>
              Generate {selectedCount > 0 ? selectedCount : ""}
            </Button>
          )}
        </div>
      </div>
      {(running || items.some((i) => i.status === "processing")) && (
        <div className="mx-auto max-w-7xl px-4 pb-3">
          <div className="max-h-28 overflow-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-xs text-zinc-600 space-y-1">
            {items
              .filter((i) => i.status === "processing" || i.status === "error")
              .map((item) => (
                <div key={item.exoId} className="flex justify-between gap-2">
                  <span className="truncate">
                    #{item.exoId} {item.name}
                  </span>
                  <span className={item.status === "error" ? "text-red-600" : "text-zinc-500"}>
                    {item.status === "error" ? item.error || "error" : "processing"}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
