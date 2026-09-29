"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import type { ExerciseImageBoardItem } from "@/lib/images/types";
import { FramePlayer } from "@/components/images/frame-player";
import { statusLabel } from "@/lib/images/urls";
import { cn } from "@/lib/utils";

export function ExerciseImageCard({
  exercise,
  selected,
  onToggle,
}: {
  exercise: ExerciseImageBoardItem;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-white shadow-xs transition-colors",
        selected ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-300",
      )}
    >
      <div className="absolute left-2 top-2 z-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-zinc-300"
          aria-label={`Select ${exercise.display_name}`}
        />
      </div>
      <Link href={`/images/${exercise.exo_id}`} className="block">
        <div
          className="aspect-square bg-zinc-100"
          style={{
            backgroundImage:
              "linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4e4e7 75%),linear-gradient(-45deg,transparent 75%,#e4e4e7 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
          }}
        >
          <FramePlayer
            frames={exercise.active_frames}
            fallbackUrl={exercise.preview_image?.image_url ?? null}
            alt={exercise.display_name}
            width={400}
          />
        </div>
        <div className="space-y-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900">
                {exercise.display_name}
              </div>
              <div className="text-xs text-zinc-500">#{exercise.exo_id}</div>
            </div>
            <Badge
              className={cn(
                exercise.status === "complete" && "bg-emerald-50 text-emerald-700",
                exercise.status === "partial" && "bg-amber-50 text-amber-700",
                exercise.status === "inactive_only" && "bg-zinc-100 text-zinc-600",
              )}
            >
              {statusLabel(exercise.status)}
            </Badge>
          </div>
          <div className="truncate text-[11px] text-zinc-500">
            {exercise.primary_muscle_group?.name ?? "—"} · {exercise.equipment?.name ?? "—"}
            {exercise.active_count > 0 ? ` · ${exercise.active_count}/3` : ""}
          </div>
        </div>
      </Link>
    </div>
  );
}
