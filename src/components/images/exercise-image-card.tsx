"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import type { ExerciseImageBoardItem, Subject } from "@/lib/images/types";
import { SUBJECTS } from "@/lib/images/types";
import { FramePlayer } from "@/components/images/frame-player";
import { statusLabel } from "@/lib/images/urls";
import { cn } from "@/lib/utils";

const SUBJECT_LABEL: Record<Subject, string> = {
  man: "Man",
  woman: "Woman",
};

export function ExerciseImageCard({
  exercise,
  selected,
  onToggle,
}: {
  exercise: ExerciseImageBoardItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const framesPerSubject = exercise.frame_positions.length;
  const activeSummary = SUBJECTS.map((subject) => {
    const status = exercise.by_subject.find((s) => s.subject === subject);
    return `${SUBJECT_LABEL[subject]} ${status?.active_count ?? 0}/${framesPerSubject}`;
  }).join(" · ");

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
        <div className="grid grid-cols-2 gap-px bg-zinc-200">
          {SUBJECTS.map((subject) => {
            const status = exercise.by_subject.find((s) => s.subject === subject);
            return (
              <div
                key={subject}
                className="relative aspect-square bg-zinc-100"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4e4e7 75%),linear-gradient(-45deg,transparent 75%,#e4e4e7 75%)",
                  backgroundSize: "16px 16px",
                  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
                }}
              >
                <FramePlayer
                  frames={status?.active_frames ?? []}
                  fallbackUrl={status?.preview_image?.image_url ?? null}
                  alt={`${exercise.display_name} · ${SUBJECT_LABEL[subject]}`}
                  width={200}
                />
                <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {SUBJECT_LABEL[subject]}
                </span>
              </div>
            );
          })}
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
          </div>
          <div className="truncate text-[11px] text-zinc-500">{activeSummary}</div>
        </div>
      </Link>
    </div>
  );
}
