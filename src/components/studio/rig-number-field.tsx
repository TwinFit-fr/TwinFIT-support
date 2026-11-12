"use client";

import { useState } from "react";
import { parseEntry, stepEntry } from "@/lib/studio/joint-props";
import { cn } from "@/lib/utils";

const AXES = ["x", "y", "z"] as const;
type Axis = (typeof AXES)[number];

/** The axis colours of the gizmo (x red, y green, z blue), light enough to read as text on the dark panel. */
const AXIS_TONE: Record<Axis, string> = { x: "text-[#ff8a8a]", y: "text-[#7fe39a]", z: "text-[#8fb3ff]" };
const AXIS_EDGE: Record<Axis, string> = { x: "focus-within:border-[#ff8a8a]", y: "focus-within:border-[#7fe39a]", z: "focus-within:border-[#8fb3ff]" };

export type StepCommit = { value: number; stepping: boolean };

/**
 * One number of the rig editor. Typing commits on Enter or blur (Escape restores); the arrow keys
 * (ten steps with Shift) and the spinner commit at once, so the point moves while you press. A
 * value outside the limits is kept at the limit and `onClamp` says so. Arrow-key presses held
 * down are one gesture (`stepping`), ended by `onStepEnd` when the key is released.
 */
function RigNumberField({
  axis,
  label,
  value,
  step,
  min,
  max,
  digits,
  unit,
  disabled,
  onCommit,
  onClamp,
  onStepEnd,
}: {
  axis: Axis;
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  digits: number;
  unit: string;
  disabled?: boolean;
  onCommit: (commit: StepCommit) => void;
  onClamp: (message: string | null) => void;
  onStepEnd: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  // A new value from outside (a drag on the stage, undo) drops what was being typed.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(null);
  }
  const shown = text ?? (Number.isFinite(value) ? value.toFixed(digits) : "");
  const limitWords = `${label} is kept between ${min} and ${max} ${unit}`;

  const commitText = (raw: string | null, stepping: boolean) => {
    if (raw === null) return;
    setText(null);
    const entry = parseEntry(raw, { min, max });
    if (entry.kind !== "ok") return;
    onClamp(entry.clamped ? `${limitWords}: set to ${entry.value} ${unit}.` : null);
    if (entry.value !== value) onCommit({ value: entry.value, stepping });
  };
  const stepBy = (direction: 1 | -1, coarse: boolean) => {
    const base = text !== null ? (parseEntry(text, { min, max }).kind === "ok" ? Number(text.replace(",", ".")) : value) : value;
    const next = stepEntry(Math.min(max, Math.max(min, base)), direction, { step, min, max, coarse });
    setText(null);
    onClamp(next === base ? `${limitWords}: it is at the limit.` : null);
    if (next !== value) onCommit({ value: next, stepping: true });
  };

  return (
    <label className={cn("relative flex h-8 items-center rounded-lg border border-(--m3-outline) bg-(--m3-surface-container-high) transition-colors focus-within:bg-(--m3-surface-container-highest) focus-within:ring-2 focus-within:ring-(--m3-primary)/50", AXIS_EDGE[axis], disabled && "opacity-50")}>
      <span className={cn("pointer-events-none pl-2 font-mono text-[11px] font-semibold uppercase", AXIS_TONE[axis])} aria-hidden="true">
        {axis}
      </span>
      <input
        type="number"
        inputMode="decimal"
        aria-label={`${label}, ${unit}`}
        disabled={disabled}
        step={step}
        min={min}
        max={max}
        value={shown}
        className="h-full w-full min-w-0 bg-transparent pr-1.5 pl-1.5 text-right font-mono text-[12px] tabular-nums text-(--m3-on-surface) outline-none"
        onChange={(e) => {
          // The spinner sends a plain input event, typing an InputEvent with an inputType: the spinner commits at once.
          const typed = typeof (e.nativeEvent as InputEvent).inputType === "string" && (e.nativeEvent as InputEvent).inputType !== "";
          if (typed) setText(e.target.value);
          else {
            commitText(e.target.value, false);
          }
        }}
        onBlur={() => {
          commitText(text, false);
          onStepEnd();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            stepBy(e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
          } else if (e.key === "Enter") {
            commitText(text, false);
          } else if (e.key === "Escape" && text !== null) {
            e.preventDefault();
            e.stopPropagation();
            setText(null);
            onClamp(null);
          }
        }}
        onKeyUp={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") onStepEnd();
        }}
      />
    </label>
  );
}

/** Three numbers of a vector, one per axis, with a caption (Position, Rotation) and its unit. */
export function RigVectorFields({
  caption,
  name,
  value,
  unit,
  step,
  limit,
  digits = 0,
  disabled,
  onCommit,
  onClamp,
  onStepEnd,
}: {
  caption: string;
  /** The point's name, for the fields' accessible names ("Left hand position x"). */
  name: string;
  value: [number, number, number];
  unit: string;
  step: number;
  limit: number;
  digits?: number;
  disabled?: boolean;
  onCommit: (next: [number, number, number], stepping: boolean) => void;
  onClamp: (message: string | null) => void;
  onStepEnd: () => void;
}) {
  return (
    <div role="group" aria-label={`${name} ${caption.toLowerCase()} in ${unit}`}>
      <div className="mb-1 flex items-baseline justify-between text-[10px] font-semibold tracking-[0.12em] text-(--m3-on-surface-variant) uppercase">
        <span>{caption}</span>
        <span className="font-normal tracking-normal normal-case">{unit}</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {AXES.map((axis, i) => (
          <RigNumberField
            key={axis}
            axis={axis}
            label={`${name} ${caption.toLowerCase()} ${axis}`}
            value={value[i]}
            step={step}
            min={-limit}
            max={limit}
            digits={digits}
            unit={unit}
            disabled={disabled}
            onCommit={({ value: v, stepping }) => {
              const next = [...value] as [number, number, number];
              next[i] = v;
              onCommit(next, stepping);
            }}
            onClamp={onClamp}
            onStepEnd={onStepEnd}
          />
        ))}
      </div>
    </div>
  );
}
