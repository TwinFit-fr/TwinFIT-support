"use client";

import { STATUS_DOT } from "@/components/images/exercise-image-card";
import { cn } from "@/lib/utils";

export type BoardStatus = keyof typeof STATUS_DOT;
export type StatusFilter = "all" | BoardStatus;

const STATUS_FILTERS: [StatusFilter, string][] = [
  ["all", "All"],
  ["empty", "Empty"],
  ["partial", "Partial"],
  ["complete", "Complete"],
  ["inactive_only", "Inactive"],
];

export const BOARD_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";

/** Boards refetch on this interval, so work done in other tabs or by other staff shows up. */
export const BOARD_REFRESH_MS = 8000;

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

export function statusCounts(statuses: BoardStatus[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: statuses.length,
    empty: 0,
    partial: 0,
    complete: 0,
    inactive_only: 0,
  };
  for (const status of statuses) counts[status] += 1;
  return counts;
}

/** All / Empty / Partial / Complete / Inactive tabs with counts. */
export function StatusTabs({
  value,
  onChange,
  counts,
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}) {
  return (
    <div className="inline-flex rounded-lg bg-zinc-100 p-0.5" role="tablist">
      {STATUS_FILTERS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
            value === id ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-600 hover:text-zinc-900",
          )}
        >
          {id !== "all" && <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[id])} />}
          {label}
          <span className="tabular-nums text-zinc-400">{counts[id]}</span>
        </button>
      ))}
    </div>
  );
}
