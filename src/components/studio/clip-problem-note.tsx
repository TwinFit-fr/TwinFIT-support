"use client";

import { TriangleAlert } from "lucide-react";
import type { ClipProblem } from "@/lib/studio/clip-problems";
import { cn } from "@/lib/utils";

/** On a clip row: why the file cannot be edited (or played), in a few words, instead of an edit control that leads nowhere. */
export function ClipProblemNote({ problem, className }: { problem: ClipProblem; className?: string }) {
  return (
    <span className={cn("flex items-start gap-1 text-[11px] leading-snug", problem.kind === "unreadable" ? "text-(--m3-error)" : "text-(--m3-on-surface-variant)", className)} data-clip-problem={problem.kind}>
      <TriangleAlert className={cn("mt-0.5 h-3 w-3 shrink-0", problem.kind === "unreadable" ? "" : "text-(--m3-warning)")} aria-hidden="true" />
      <span>{problem.kind === "unreadable" ? `Could not be read: ${problem.short}` : "Plays only: keyframes, not poses, so it cannot be edited"}</span>
    </span>
  );
}
