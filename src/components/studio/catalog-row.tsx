"use client";

import { memo } from "react";
import { AlertTriangle, Check, CircleDashed, Clock, Dumbbell } from "lucide-react";
import type { ExerciseState } from "@/lib/studio/catalog-filter";
import type { StudioExercise } from "@/lib/studio/types";
import { cn } from "@/lib/utils";

export const STATE_LABEL: Record<ExerciseState, string> = {
  todo: "To do",
  queued: "In queue",
  ready: "Ready",
  failed: "Failed",
};

const STATE_STYLE: Record<ExerciseState, { icon: typeof Check; tone: string }> = {
  todo: { icon: CircleDashed, tone: "text-(--m3-on-surface-variant) border-(--m3-outline)" },
  queued: { icon: Clock, tone: "text-(--m3-warning) border-(--m3-warning)/40" },
  ready: { icon: Check, tone: "text-(--m3-success) border-(--m3-success)/40" },
  failed: { icon: AlertTriangle, tone: "text-(--m3-error) border-(--m3-error)/50" },
};

/** What the tooltip says about the clips behind the state. */
export function stateDetail(v: StudioExercise["vectors"]): string {
  if (!v.total) return "No movement yet";
  return [v.ready ? `${v.ready} ready` : null, v.queued ? `${v.queued} in queue` : null, v.failed ? `${v.failed} failed` : null]
    .filter(Boolean)
    .join(" · ");
}

/** A state as words and a shape, never colour alone. */
export function StateBadge({ state, title, collapsible = false }: { state: ExerciseState; title?: string; /** At the narrowest pane the word folds away and the icon stays, with the word as its accessible name. */ collapsible?: boolean }) {
  const { icon: Icon, tone } = STATE_STYLE[state];
  return (
    <span
      title={collapsible ? `${STATE_LABEL[state]}${title ? `: ${title}` : ""}` : title}
      className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium leading-none", tone)}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className={collapsible ? "sr-only @[15.5rem]/pane:not-sr-only" : undefined}>{STATE_LABEL[state]}</span>
    </span>
  );
}

/**
 * One catalog row. Primitive props keep the memo effective (a style object or a fresh callback
 * would be new on every render). Only the row that holds the list's tab stop is tabbable; the
 * arrow keys move focus between rows without choosing one.
 */
export const CatalogRow = memo(function CatalogRow({
  exercise,
  state,
  selected,
  tabbable,
  onSelect,
  onFocusRow,
  top,
  height,
}: {
  exercise: StudioExercise;
  state: ExerciseState;
  selected: boolean;
  tabbable: boolean;
  onSelect: (id: string) => void;
  onFocusRow: (id: string) => void;
  top: number;
  height: number;
}) {
  const meta = [exercise.group?.name, exercise.equipment && exercise.equipment.code !== "NONE" ? exercise.equipment.name : null]
    .filter(Boolean)
    .join(" · ");
  const line2 = [`#${exercise.exo_id}`, meta].filter(Boolean).join(" · ");
  const metaTone = selected ? "text-(--m3-on-secondary-container)" : "text-(--m3-on-surface-variant)";
  return (
    <button
      type="button"
      style={{ top, height }}
      data-exo-id={exercise.id}
      tabIndex={tabbable ? 0 : -1}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(exercise.id)}
      onFocus={() => onFocusRow(exercise.id)}
      onKeyDown={(event) => {
        // Space opens the focused exercise; the page's play/pause shortcut must not take it.
        if (event.key === " ") event.stopPropagation();
      }}
      className={cn(
        "studio-state absolute left-2 right-2 flex cursor-pointer items-center gap-2 rounded-xl px-2 py-0.5 text-left outline-none transition-colors @[17rem]/pane:gap-3 @[17rem]/pane:px-2.5 focus-visible:ring-2 focus-visible:ring-(--m3-primary)",
        selected ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "text-(--m3-on-surface)",
      )}
    >
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-(--m3-surface-container-highest) @[17rem]/pane:h-11 @[17rem]/pane:w-11">
        {exercise.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${exercise.thumbnail_url}?w=96&q=70`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-(--m3-on-surface-variant)">
            <Dumbbell className="h-4 w-4" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium leading-tight" title={exercise.display_name}>
          {exercise.display_name}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className={cn("min-w-0 flex-1 truncate text-[11px] leading-tight", metaTone)} title={line2}>
            {line2}
          </div>
          <StateBadge state={state} title={stateDetail(exercise.vectors)} collapsible />
        </div>
      </div>
    </button>
  );
});
