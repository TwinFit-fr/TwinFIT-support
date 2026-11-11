"use client";

import { clinicalForearm, flatAnkle, getPoseValue, type PoseAngles, type PoseField } from "@/lib/studio/anatomy";
import { cn } from "@/lib/utils";
import { NumberField } from "./ui";

/** The forearm as a goniometer reads it, next to the Studio's zero at full supination. */
function forearmNote(value: number): string {
  const clinical = Math.round(clinicalForearm(value));
  return clinical === 0 ? "mid-position" : clinical > 0 ? `${clinical}° pronation` : `${-clinical}° supination`;
}

/**
 * One joint value: a slider for the gesture (its drag is one undo step) and a number field for
 * exact entry. Both are labelled for assistive tech.
 */
function Slider({
  field,
  value,
  onChange,
  onGestureEnd,
  compact = false,
  note,
  locked,
}: {
  field: PoseField;
  value: number | null;
  onChange: (value: number, gesture: boolean) => void;
  onGestureEnd: () => void;
  compact?: boolean;
  /** A second reading of the value, under the slider. */
  note?: string;
  /** Why the value cannot be set here: it follows from something else. */
  locked?: string;
}) {
  const step = field.step ?? 1;
  const shown = value ?? 0;
  const number = (
    <span className="flex shrink-0 items-center gap-0.5 font-mono tabular-nums">
      <NumberField
        aria-label={`${field.label} (${field.unit})`}
        min={field.min}
        max={field.max}
        step={step}
        digits={field.unit === "m" ? 2 : 0}
        value={shown}
        disabled={Boolean(locked)}
        onCommit={(v) => onChange(v, false)}
        className="h-6 w-14 rounded-md px-1 py-0 text-right text-[11px]"
      />
      <span className="w-3 text-(--m3-on-surface-variant)">{field.unit}</span>
    </span>
  );
  const slider = (
    <input
      type="range"
      aria-label={field.label}
      min={field.min}
      max={field.max}
      step={step}
      value={shown}
      disabled={Boolean(locked)}
      onChange={(e) => onChange(Number(e.target.value), true)}
      onPointerUp={onGestureEnd}
      onKeyUp={onGestureEnd}
      onBlur={onGestureEnd}
      className={cn("h-1.5 w-full min-w-0 accent-(--m3-primary)", locked ? "cursor-not-allowed" : "cursor-pointer")}
    />
  );
  return (
    <div className={cn("text-[11px]", locked && "opacity-60")} title={locked}>
      {compact ? (
        // Narrow column (one side of a pair): the label gets the full width, the number sits by the slider.
        <>
          <div className="leading-tight text-(--m3-on-surface-variant)">{field.label}</div>
          <div className="mt-1 flex items-center gap-2">
            {slider}
            {number}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-(--m3-on-surface-variant)" title={field.label}>
              {field.label}
            </span>
            {number}
          </div>
          <div className="mt-1">{slider}</div>
        </>
      )}
      {note ? <div className="mt-0.5 text-right text-[10px] text-(--m3-on-surface-variant)">{note}</div> : null}
    </div>
  );
}

/** One column of sliders, for a side or a central group. */
export function PoseSliders({
  fields,
  pose,
  onChange,
  onGestureEnd,
  compact,
  followsFloor = false,
  side,
}: {
  fields: PoseField[];
  pose: PoseAngles;
  onChange: (path: string, value: number, gesture: boolean) => void;
  onGestureEnd: () => void;
  compact?: boolean;
  /** This leg's sole is on the floor, flat: its ankle is worked out from the leg. */
  followsFloor?: boolean;
  side?: "left" | "right";
}) {
  return (
    <div className="space-y-2.5">
      {fields.map((f) => {
        const value = getPoseValue(pose, f.path);
        const ankle = followsFloor && side && f.path.endsWith(".ankle_dorsiflexion");
        return (
          <Slider
            key={f.path}
            field={f}
            value={ankle ? flatAnkle(pose, side) : value}
            onChange={(v, g) => onChange(f.path, v, g)}
            onGestureEnd={onGestureEnd}
            compact={compact}
            note={f.path.endsWith(".forearm_pronation") ? forearmNote(value ?? 0) : undefined}
            locked={ankle ? "Follows the floor: the sole stays flat. Turn off Flat feet in Body to set it." : undefined}
          />
        );
      })}
    </div>
  );
}
