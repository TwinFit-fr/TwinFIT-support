"use client";

import { Check } from "lucide-react";
import { CHECKER_STYLE } from "@/components/images/checker";
import { STATUS_DOT } from "@/components/images/exercise-image-card";
import type { MuscleMapBoardTarget, MuscleMapView } from "@/lib/images/types";
import { MUSCLE_MAP_VIEWS } from "@/lib/images/types";
import { imageThumbUrl, statusLabel } from "@/lib/images/urls";
import { cn } from "@/lib/utils";

export const VIEW_LABEL: Record<MuscleMapView, string> = { front: "Front", back: "Back" };

export function MuscleMapCard({
  target,
  selected,
  selecting,
  onToggle,
  onOpen,
}: {
  target: MuscleMapBoardTarget;
  selected: boolean;
  /** Something on the board is selected: checkboxes stay visible. */
  selecting: boolean;
  /** `range`: Shift was held, extend from the last toggled card. */
  onToggle: (range: boolean) => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-white transition-all",
        selected
          ? "border-zinc-900 ring-2 ring-zinc-900/10"
          : "border-zinc-200 hover:border-zinc-300 hover:shadow-sm",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${target.name}`}
        title="Select · Shift-click for a range"
        onClick={(event) => onToggle(event.shiftKey)}
        className={cn(
          "absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-md border shadow-xs transition",
          selected
            ? "border-zinc-900 bg-zinc-900 text-white"
            : "border-zinc-300 bg-white/90 text-transparent hover:border-zinc-500",
          !selected && !selecting && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="grid grid-cols-2 gap-px bg-zinc-200">
          {MUSCLE_MAP_VIEWS.map((view) => {
            const url = imageThumbUrl(target.active[view]?.image_url, 320);
            return (
              <div key={view} className="relative aspect-square" style={CHECKER_STYLE}>
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={`${target.name} · ${VIEW_LABEL[view]}`}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                )}
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 shadow-xs">
                  {VIEW_LABEL[view]}
                </span>
              </div>
            );
          })}
        </div>
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <span
              title={statusLabel(target.status)}
              aria-label={statusLabel(target.status)}
              className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[target.status])}
            />
            <span className="truncate text-[13px] font-medium text-zinc-900">{target.name}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span>{target.kind === "muscle_group" ? "Group" : "Muscle"}</span>
            <span className="truncate text-zinc-400">{target.code}</span>
          </div>
        </div>
      </button>
    </div>
  );
}
