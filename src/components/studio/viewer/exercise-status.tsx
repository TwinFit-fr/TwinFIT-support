"use client";

import { useRef, type Ref } from "react";
import { Hand, SlidersHorizontal } from "lucide-react";
import type { DragMode } from "@/lib/studio/drag-mode";
import { POINT_LABEL, type PointId } from "@/lib/studio/pose-points";
import { cn } from "@/lib/utils";
import type { ExerciseStatus } from "./pose-stage";

const MODES: { value: DragMode; label: string; title: string; Icon: typeof Hand }[] = [
  { value: "exercise", label: "Exercise", title: "A drag changes the exercise's settings (range, stance, grip, lean) and every pose follows", Icon: SlidersHorizontal },
  { value: "limb", label: "Limb", title: "A drag moves only that limb, inside its range of motion", Icon: Hand },
];

/** What a drag on the stage does: a two-choice radio group (arrow keys move between them). */
export function DragModeControl({ mode, onChange }: { mode: DragMode; onChange: (mode: DragMode) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div role="radiogroup" aria-label="What a drag changes" className="flex shrink-0 items-center rounded-full bg-(--m3-surface-container-highest)/70 p-0.5" data-drag-mode={mode}>
      {MODES.map((m, i) => {
        const on = mode === m.value;
        return (
          <button
            key={m.value}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={m.title}
            onClick={() => onChange(m.value)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
              event.preventDefault();
              const next = MODES[(i + 1) % MODES.length];
              onChange(next.value);
              buttons.current[(i + 1) % MODES.length]?.focus();
            }}
            className={cn(
              "studio-state inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/80",
              on ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)",
            )}
          >
            <m.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function UseLimb({ onLimb }: { onLimb: () => void }) {
  return (
    <button
      type="button"
      onClick={onLimb}
      className="studio-state ml-1 inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full bg-(--m3-tertiary-container) px-2.5 font-medium text-(--m3-on-surface) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/80"
    >
      <Hand className="h-3.5 w-3.5" aria-hidden="true" /> Move it by hand
    </button>
  );
}

/**
 * The status line in Exercise mode: what the drag changes while it changes ("Range: deep"), what
 * the last drag applied, or, when no setting moves the point, that plain fact and the way to Limb.
 */
export function ExerciseLine({
  status,
  done,
  selected,
  replaces,
  onLimb,
}: {
  status: ExerciseStatus | null;
  done: string | null;
  selected: PointId | null;
  /** What a rebuild replaces ("replaces the saved clip's poses"), null when nothing would be lost. */
  replaces: string | null;
  onLimb: () => void;
}) {
  let main: React.ReactNode;
  let rest: string | null = null;
  let offer = false;
  if (status?.kind === "none") {
    main = POINT_LABEL[status.id];
    rest = " · no exercise setting moves it";
    offer = true;
  } else if (status?.kind === "live" && status.off) {
    main = `No setting moves the ${POINT_LABEL[status.id].toLowerCase()} that way`;
    offer = true;
  } else if (status?.kind === "live" && status.setting && status.value) {
    main = `${status.setting}: ${status.value.toLowerCase()}`;
    rest = [status.changed ? null : "as it was", status.limit ? "as far as it goes" : null, status.pose ? `on ${status.pose}` : null, status.replaces && status.changed ? status.replaces : null].filter(Boolean).map((t) => ` · ${t}`).join("");
  } else if (status?.kind === "live") {
    main = POINT_LABEL[status.id];
    rest = " · drag it: the setting that takes it there follows";
  } else if (done) {
    main = done;
    rest = " · every pose rebuilt · Ctrl+Z undoes";
  } else if (selected) {
    main = POINT_LABEL[selected];
    rest = " · drag it: the exercise settings follow";
  } else {
    main = null;
    rest = replaces ? `Drag the body: the settings follow (${replaces})` : "Drag the body: the exercise settings follow";
  }
  return (
    <>
      <span className="min-w-0 py-0.5 leading-snug text-pretty" data-exercise-line>
        {main ? <span className="font-semibold text-(--m3-on-surface)">{main}</span> : null}
        {rest ? <span className="text-(--m3-on-surface-variant)">{rest}</span> : null}
      </span>
      {offer ? <UseLimb onLimb={onLimb} /> : null}
    </>
  );
}

/** Next to the dragged point: the setting being followed and its choices, the nearest one lit. */
export function ExerciseBadge({ status, ref }: { status: ExerciseStatus | null; ref: Ref<HTMLDivElement> }) {
  const live = status?.kind === "live" && status.setting && !status.off ? status : null;
  return (
    <div ref={ref} aria-hidden="true" className="pose-setting-badge studio-glass" data-show={live ? "true" : undefined}>
      {live ? (
        <>
          <span className="pose-setting-badge-name">{live.setting}</span>
          <span className="flex items-center gap-0.5">
            {live.options.map((option, i) => (
              <span key={option} className="pose-setting-badge-option" data-on={i === live.index ? "true" : undefined}>
                {option}
              </span>
            ))}
          </span>
        </>
      ) : null}
    </div>
  );
}
