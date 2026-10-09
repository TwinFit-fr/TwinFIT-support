"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import {
  FRAME_POSITIONS,
  MUSCLE_MAP_CROPS,
  MUSCLE_MAP_CROP_LABEL,
  MUSCLE_MAP_VIEWS,
  MUSCLE_MAP_VIEW_LABEL,
  SUBJECTS,
} from "@/lib/images/types";
import type {
  FrameCountChoice,
  ImageStyle,
  MuscleMapCrop,
  MuscleMapView,
  Subject,
} from "@/lib/images/types";
import { cn } from "@/lib/utils";

/**
 * The controls every Images page uses to set up a generation. Several-of choices are checkbox
 * chips, one-of choices are segmented radios, long lists are selects; all are native inputs,
 * so focus, arrow keys and screen readers behave as the browser defines.
 */

export type ControlOption<T> = { value: T; label: string; title?: string; disabled?: boolean };

const LABEL = "text-[11px] font-medium uppercase tracking-wide text-zinc-500";

/** One of a few values, as a segmented control of native radios. */
export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
  size = "sm",
}: {
  /** Names the group for screen readers; wrap in LabeledControl to also show it. */
  label: string;
  value: T;
  options: ControlOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  size?: "xs" | "sm";
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-zinc-100 p-0.5">
      {options.map((option) => (
        <label
          key={option.value}
          title={option.title}
          className={cn(
            "cursor-pointer rounded-md font-medium text-zinc-600 transition hover:text-zinc-900",
            "has-checked:bg-white has-checked:text-zinc-900 has-checked:shadow-xs",
            "has-focus-visible:ring-2 has-focus-visible:ring-zinc-400",
            "has-disabled:cursor-not-allowed has-disabled:opacity-50 has-disabled:hover:text-zinc-600",
            size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={value === option.value}
            disabled={disabled || option.disabled}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** Several of a few values (at least one), as checkbox chips. */
export function ToggleChips<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T[];
  options: ControlOption<T>[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
}) {
  function toggle(option: T, on: boolean) {
    const next = options.map((o) => o.value).filter((v) => (v === option ? on : value.includes(v)));
    // The last checked chip stays on: a run always has something to generate.
    if (next.length) onChange(next);
  }
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1">
      {options.map((option) => {
        const checked = value.includes(option.value);
        return (
          <label
            key={option.value}
            title={option.title}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition",
              "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900",
              "has-checked:border-zinc-900 has-checked:bg-zinc-900 has-checked:text-white",
              "has-focus-visible:ring-2 has-focus-visible:ring-zinc-400 has-focus-visible:ring-offset-1",
              "has-disabled:cursor-not-allowed has-disabled:opacity-50",
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              disabled={disabled || option.disabled}
              onChange={(e) => toggle(option.value, e.target.checked)}
            />
            {checked && <Check className="h-3 w-3" strokeWidth={3} />}
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

/** A control with its visible label, so each generation option reads on its own. */
export function LabeledControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={LABEL} aria-hidden>
        {label}
      </span>
      {children}
    </div>
  );
}

const ALL_POSITIONS = FRAME_POSITIONS.map((f) => f.id as number);

/** Positions a run uses: the chosen ones the exercise has, or all of them if none match. */
export function runPositionsFor(chosen: number[], available: number[] = ALL_POSITIONS): number[] {
  const run = available.filter((p) => chosen.includes(p));
  return run.length ? run : available;
}

/** Start / Mid / End to generate; positions the sequence lacks (Mid on two frames) are off. */
export function PositionToggles({
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
  return (
    <LabeledControl label="Positions">
      <ToggleChips
        label="Positions to generate"
        value={runPositionsFor(value, available)}
        disabled={disabled}
        onChange={onChange}
        options={FRAME_POSITIONS.map((frame) => ({
          value: frame.id as number,
          label: frame.label,
          disabled: !available.includes(frame.id),
          title: available.includes(frame.id) ? undefined : "Not in a two-frame sequence",
        }))}
      />
    </LabeledControl>
  );
}

const SUBJECT_LABEL: Record<Subject, string> = { man: "Man", woman: "Woman" };

/** Man / Woman to generate for. */
export function SubjectToggles({
  value,
  onChange,
  disabled,
}: {
  value: Subject[];
  onChange: (next: Subject[]) => void;
  disabled?: boolean;
}) {
  return (
    <LabeledControl label="Subjects">
      <ToggleChips
        label="Subjects to generate"
        value={value}
        disabled={disabled}
        onChange={onChange}
        options={SUBJECTS.map((s) => ({ value: s, label: SUBJECT_LABEL[s] }))}
      />
    </LabeledControl>
  );
}

/** Front / back muscle map views to generate. */
export function ViewToggles({
  value,
  onChange,
  disabled,
}: {
  value: MuscleMapView[];
  onChange: (next: MuscleMapView[]) => void;
  disabled?: boolean;
}) {
  return (
    <LabeledControl label="Views">
      <ToggleChips
        label="Views to generate"
        value={value}
        disabled={disabled}
        onChange={onChange}
        options={MUSCLE_MAP_VIEWS.map((v) => ({ value: v, label: MUSCLE_MAP_VIEW_LABEL[v] }))}
      />
    </LabeledControl>
  );
}

/** Full / upper / lower muscle map crops to generate. */
export function CropToggles({
  value,
  onChange,
  disabled,
}: {
  value: MuscleMapCrop[];
  onChange: (next: MuscleMapCrop[]) => void;
  disabled?: boolean;
}) {
  return (
    <LabeledControl label="Crops">
      <ToggleChips
        label="Crops to generate"
        value={value}
        disabled={disabled}
        onChange={onChange}
        options={MUSCLE_MAP_CROPS.map((c) => ({ value: c, label: MUSCLE_MAP_CROP_LABEL[c] }))}
      />
    </LabeledControl>
  );
}

/**
 * Frames per sequence. On the board, "Per exercise" keeps each exercise's own count and a
 * number is saved on every selected exercise; in the workspace it is the exercise's count.
 */
export function SequenceLengthControl<T extends FrameCountChoice>({
  value,
  onChange,
  disabled,
  perExercise = false,
}: {
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  /** Offer "Per exercise" (batch runs). */
  perExercise?: boolean;
}) {
  const options: ControlOption<FrameCountChoice>[] = [
    ...(perExercise ? [{ value: "exercise" as const, label: "Per exercise" }] : []),
    { value: 2, label: "2", title: "Start + End" },
    { value: 3, label: "3", title: "Start + Mid + End" },
  ];
  return (
    <LabeledControl label="Frames">
      <SegmentedControl
        label="Frames per sequence"
        value={value}
        disabled={disabled}
        onChange={(next) => onChange(next as T)}
        options={options}
      />
    </LabeledControl>
  );
}

/** How a style is named in every picker: name, then default / draft. */
export function styleLabel(style: Pick<ImageStyle, "name" | "is_default" | "published">): string {
  return `${style.name}${style.is_default ? " · default" : ""}${style.published ? "" : " · draft"}`;
}

export function StyleSelector({
  styles,
  value,
  onChange,
  disabled,
}: {
  styles: ImageStyle[];
  value: string | null;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className={LABEL}>Style</span>
      <select
        value={value ?? ""}
        disabled={disabled || styles.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[10rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 hover:border-zinc-400 focus:border-zinc-900 focus:outline-none disabled:opacity-50"
      >
        {styles.length === 0 ? (
          <option value="">Loading styles…</option>
        ) : (
          styles.map((style) => (
            <option key={style.id} value={style.id}>
              {styleLabel(style)}
            </option>
          ))
        )}
      </select>
    </label>
  );
}
