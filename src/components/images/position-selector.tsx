"use client";

import { SUBJECT_OPTIONS } from "@/lib/images/capabilities";
import { FRAME_POSITIONS, framePositionLabel } from "@/lib/images/types";
import type { FrameCountChoice, SubjectChoice } from "@/lib/images/types";
import { cn } from "@/lib/utils";

/** A native select with a visible label, so each generation option reads on its own. */
export function SelectField({
  label,
  value,
  onChange,
  disabled,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 hover:border-zinc-400 focus:border-zinc-900 focus:outline-none disabled:opacity-50",
          className,
        )}
      >
        {children}
      </select>
    </label>
  );
}

const ALL_POSITIONS = FRAME_POSITIONS.map((f) => f.id as number);

/** Positions a run uses: the chosen ones the exercise has, or all of them if none match. */
export function runPositionsFor(chosen: number[], available: number[] = ALL_POSITIONS): number[] {
  const run = available.filter((p) => chosen.includes(p));
  return run.length ? run : available;
}

/** "All frames", then each single position, then each pair (when three are available). */
function positionOptions(available: number[]) {
  const singles = available.map((p) => ({
    positions: [p],
    label: `${framePositionLabel(p)} only`,
  }));
  const pairs =
    available.length > 2
      ? available.flatMap((a, i) =>
          available.slice(i + 1).map((b) => ({
            positions: [a, b],
            label: `${framePositionLabel(a)} + ${framePositionLabel(b)}`,
          })),
        )
      : [];
  return [{ positions: available, label: "All frames" }, ...singles, ...pairs];
}

export function PositionSelector({
  value,
  onChange,
  disabled,
  available = ALL_POSITIONS,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
  /** Positions offered (e.g. [0, 2] for two-frame exercises); defaults to all. */
  available?: number[];
}) {
  const options = positionOptions(available);
  const current = runPositionsFor(value, available).join(",");
  return (
    <SelectField
      label="Positions"
      value={current}
      disabled={disabled}
      onChange={(key) => onChange(options.find((o) => o.positions.join(",") === key)!.positions)}
    >
      {options.map((option) => (
        <option key={option.label} value={option.positions.join(",")}>
          {option.label}
        </option>
      ))}
    </SelectField>
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
    <SelectField
      label="Subject"
      value={value}
      disabled={disabled}
      onChange={(next) => onChange(next as SubjectChoice)}
    >
      {SUBJECT_OPTIONS.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </SelectField>
  );
}

const FRAME_COUNT_OPTIONS: { id: FrameCountChoice; label: string }[] = [
  { id: "exercise", label: "Per exercise" },
  { id: 2, label: "2 · Start + End" },
  { id: 3, label: "3 · Start + Mid + End" },
];

/** Frames per sequence for a batch; a number is saved on every selected exercise. */
export function FrameCountSelector({
  value,
  onChange,
  disabled,
}: {
  value: FrameCountChoice;
  onChange: (next: FrameCountChoice) => void;
  disabled?: boolean;
}) {
  return (
    <SelectField
      label="Frames"
      value={String(value)}
      disabled={disabled}
      onChange={(next) => onChange(next === "exercise" ? next : (Number(next) as 2 | 3))}
    >
      {FRAME_COUNT_OPTIONS.map((option) => (
        <option key={option.id} value={String(option.id)}>
          {option.label}
        </option>
      ))}
    </SelectField>
  );
}
