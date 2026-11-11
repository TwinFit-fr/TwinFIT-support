"use client";

import { FileCheck2, LayoutTemplate, PenLine, PersonStanding, Sparkles } from "lucide-react";
import { DEFAULT_PARAMS } from "@/lib/studio/exercise-templates";
import { originLabel, type DraftOrigin } from "@/lib/studio/pose-origin";
import { useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";

const ICON: Record<DraftOrigin["kind"], typeof Sparkles> = {
  template: LayoutTemplate,
  ai: Sparkles,
  clip: FileCheck2,
  neutral: PersonStanding,
};

/**
 * Where the poses on the stage came from, for as long as they are there: the base origin
 * (template, AI draft, saved clip, neutral pose) and, after the first manual change, "Edited by
 * you" beside it. Both come from the pose document, so undo and redo change them too.
 */
export function DraftOriginLine({ className }: { className?: string }) {
  const origin = useStudioStore((s) => s.poseEdit?.origin ?? null);
  const edited = useStudioStore((s) => s.poseEdit?.edited ?? false);
  if (!origin) return null;
  const label = originLabel(origin, edited, DEFAULT_PARAMS);
  const Icon = ICON[origin.kind];
  const notes = origin.kind === "ai" ? origin.notes : null;
  return (
    <div className={cn("min-w-0", className)} data-draft-origin={origin.kind} data-edited={edited || undefined}>
      {/* Announced when it changes: a draft landing, the first edit, a save. */}
      <p role="status" aria-live="polite" className="sr-only">
        {label.text}
      </p>
      <div aria-hidden className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-(--studio-radius-md)",
            origin.kind === "ai" ? "bg-(--m3-tertiary-container) text-(--m3-tertiary)" : "bg-(--m3-surface-container-highest) text-(--m3-on-surface)",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-(length:--studio-text-sm) font-semibold leading-tight tracking-tight text-(--m3-on-surface)" title={label.text}>
            {label.base}
          </div>
          {/* Wraps in a narrow pane rather than cutting what the poses are. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] leading-snug">
            {label.detail ? <span className="text-(--m3-on-surface-variant)">{label.detail}</span> : null}
            {edited ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-(--m3-secondary-container) px-1.5 font-medium text-(--m3-on-secondary-container)">
                <PenLine className="h-3 w-3" /> Edited by you
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {notes ? <p className="mt-1.5 text-[11px] leading-snug text-(--m3-on-surface-variant)">{notes}</p> : null}
    </div>
  );
}
