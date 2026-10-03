"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { ExerciseImageBoardItem, Subject } from "@/lib/images/types";
import { SUBJECTS, framePositionLabel } from "@/lib/images/types";
import { FramePlayer } from "@/components/images/frame-player";
import { CHECKER_STYLE } from "@/components/images/checker";
import { statusLabel } from "@/lib/images/urls";
import { cn } from "@/lib/utils";

const SUBJECT_LABEL: Record<Subject, string> = {
  man: "Man",
  woman: "Woman",
};

export const STATUS_DOT: Record<ExerciseImageBoardItem["status"], string> = {
  complete: "bg-emerald-500",
  partial: "bg-amber-400",
  inactive_only: "bg-zinc-400",
  empty: "bg-zinc-200",
};

/** One dot per sequence frame, filled when that position is active. */
export function FrameDots({
  framePositions,
  activePositions,
  className,
}: {
  framePositions: number[];
  activePositions: number[];
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {framePositions.map((p) => {
        const active = activePositions.includes(p);
        return (
          <span
            key={p}
            title={`${framePositionLabel(p)}${active ? "" : " missing"}`}
            className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-zinc-300")}
          />
        );
      })}
    </span>
  );
}

export function ExerciseImageCard({
  exercise,
  selected,
  selecting,
  onToggle,
}: {
  exercise: ExerciseImageBoardItem;
  selected: boolean;
  /** Something on the board is selected: checkboxes stay visible. */
  selecting: boolean;
  onToggle: () => void;
}) {
  const meta = [exercise.primary_muscle_group?.name, exercise.equipment?.name]
    .filter(Boolean)
    .join(" · ");

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
        aria-label={`Select ${exercise.display_name}`}
        onClick={onToggle}
        className={cn(
          "absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-md border shadow-xs transition",
          selected
            ? "border-zinc-900 bg-zinc-900 text-white"
            : "border-zinc-300 bg-white/90 text-transparent hover:border-zinc-500",
          !selected && !selecting && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
      <Link href={`/images/${exercise.exo_id}`} className="block focus-visible:outline-none">
        <div className="grid grid-cols-2 gap-px bg-zinc-200">
          {SUBJECTS.map((subject) => {
            const status = exercise.by_subject.find((s) => s.subject === subject);
            return (
              <div key={subject} className="relative aspect-square" style={CHECKER_STYLE}>
                <FramePlayer
                  frames={status?.active_frames ?? []}
                  fallbackUrl={status?.preview_image?.image_url ?? null}
                  alt={`${exercise.display_name} · ${SUBJECT_LABEL[subject]}`}
                  width={320}
                  showLabel={false}
                />
                <span className="absolute bottom-1.5 left-1.5 z-10 inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 shadow-xs">
                  {SUBJECT_LABEL[subject]}
                  <FrameDots
                    framePositions={exercise.frame_positions}
                    activePositions={status?.active_positions ?? []}
                  />
                </span>
              </div>
            );
          })}
        </div>
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <span
              title={statusLabel(exercise.status)}
              aria-label={statusLabel(exercise.status)}
              className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[exercise.status])}
            />
            <span className="truncate text-[13px] font-medium text-zinc-900 group-hover:text-zinc-950">
              {exercise.display_name}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span className="truncate">{meta || "—"}</span>
            <span className="shrink-0 tabular-nums text-zinc-400">#{exercise.exo_id}</span>
          </div>
        </div>
      </Link>
    </div>
  );
}
