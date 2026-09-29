"use client";

import { SUBJECT_OPTIONS } from "@/lib/images/capabilities";
import { FRAME_POSITIONS } from "@/lib/images/types";
import type { SubjectChoice } from "@/lib/images/types";
import { cn } from "@/lib/utils";

const chip = "rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-40";
const on = "border-zinc-900 bg-zinc-900 text-white";
const off = "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100";

export function PositionSelector({
  value,
  onChange,
  disabled,
  available,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
  /** Positions offered (e.g. [0, 2] for two-frame exercises); defaults to all. */
  available?: number[];
}) {
  const frames = FRAME_POSITIONS.filter((f) => !available || available.includes(f.id));
  const all = frames.every((f) => value.includes(f.id));

  function toggle(position: number) {
    const next = value.includes(position)
      ? value.filter((p) => p !== position)
      : [...value, position];
    if (next.some((p) => frames.some((f) => f.id === p))) onChange(next);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Positions to generate"
    >
      {frames.map((frame) => (
        <button
          key={frame.id}
          type="button"
          disabled={disabled}
          aria-pressed={value.includes(frame.id)}
          onClick={() => toggle(frame.id)}
          className={cn(chip, value.includes(frame.id) ? on : off)}
        >
          {frame.id} · {frame.label}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        aria-pressed={all}
        onClick={() => onChange([...new Set([...value, ...frames.map((f) => f.id)])])}
        className={cn(chip, all ? on : off)}
      >
        All
      </button>
    </div>
  );
}

export function SubjectSelector({
  value,
  onChange,
  disabled,
}: {
  value: SubjectChoice;
  onChange: (next: SubjectChoice) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Subject">
      {SUBJECT_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(chip, value === option.id ? on : off)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
