"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatEntry, formatValue, isUnusual, jointBones, jointEnds, jointName, parseEntry, rangeMarks, stepEntry } from "@/lib/studio/joint-props";
import { cn } from "@/lib/utils";
import { linkJoint, poseStage } from "./viewer/pose-stage";

type Change = (value: number, gesture: boolean) => void;

/**
 * The typed value of a joint: text while focused (decimals, a cleared field, a half-typed minus
 * stay as typed and never become 0), committed on Enter or blur; Escape drops it; the arrow keys
 * step it at once (Shift: ten steps), one undo step per key hold.
 */
function JointEntry({
  value,
  path,
  label,
  disabled,
  onChange,
  onGestureEnd,
  onClamp,
}: {
  value: number;
  path: string;
  label: string;
  disabled: boolean;
  onChange: Change;
  onGestureEnd: () => void;
  onClamp: (hint: string | null) => void;
}) {
  const { min, max, step, unit } = rangeMarks(path);
  const [text, setText] = useState<string | null>(null);
  // A new value from outside drops what was being typed (state adjusted during render, no effect).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(null);
  }
  const commit = () => {
    if (text === null) return;
    const entry = parseEntry(text, { min, max });
    setText(null);
    if (entry.kind !== "ok") return;
    onClamp(entry.clamped ? `Kept within the limits: ${formatValue(min, unit)} to ${formatValue(max, unit)}.` : null);
    if (entry.value !== value) onChange(entry.value, false);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      aria-label={label}
      disabled={disabled}
      value={text ?? formatEntry(value, unit)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        commit();
        onGestureEnd();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape" && text !== null) {
          e.preventDefault();
          e.stopPropagation();
          setText(null);
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const typed = text === null ? null : parseEntry(text, { min, max });
          const from = typed?.kind === "ok" ? typed.value : value;
          setText(null);
          onClamp(null);
          onChange(stepEntry(from, e.key === "ArrowUp" ? 1 : -1, { step, min, max, coarse: e.shiftKey }), true);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") onGestureEnd();
      }}
      className={cn(
        "h-[22px] w-[3.75rem] rounded-md border border-(--m3-outline) bg-(--m3-surface-container-high) px-1.5 text-right font-mono text-[12px] tabular-nums text-(--m3-on-surface) outline-none transition-colors hover:bg-(--m3-surface-container-highest) focus:border-(--m3-primary) focus:bg-(--m3-surface-container-highest) disabled:cursor-not-allowed disabled:opacity-60",
      )}
    />
  );
}

/**
 * One joint of the pose: its plain name with the side, the typed value, and a track whose ends are
 * the joint's hard limits, with the usual training range marked on it and zero (the anatomical
 * position) as a tick; under it, what each end means. A value outside the training range turns
 * amber and says so. A slider drag is one undo step. Hovering or focusing the control marks the
 * joint it turns on the stage.
 */
export function JointControl({
  path,
  value,
  onChange,
  onGestureEnd,
  locked = null,
  aside = null,
  note = null,
}: {
  path: string;
  value: number;
  onChange: Change;
  onGestureEnd: () => void;
  /** Why the value cannot be set here (it follows from something else), with a way out. */
  locked?: React.ReactNode;
  /** Next to the name: a state such as Auto. */
  aside?: React.ReactNode;
  /** A second reading of the value, or how it behaves, under the track. */
  note?: React.ReactNode;
}) {
  const id = useId();
  const name = jointName(path);
  const marks = rangeMarks(path);
  const [lo, hi] = jointEnds(path);
  const disabled = locked !== null;
  const unusual = !disabled && isUnusual(path, value);
  const [clampHint, setClampHint] = useState<string | null>(null);
  const hover = useRef(false);
  const focus = useRef(false);
  const sync = () => {
    if (hover.current || focus.current) linkJoint({ bones: jointBones(path), label: name });
    else if (poseStage.link?.label === name) linkJoint(null);
  };
  // Closing the properties while the pointer is on a control leaves no mark behind.
  useEffect(
    () => () => {
      if (poseStage.link?.label === name) linkJoint(null);
    },
    [name],
  );
  const unit = marks.unit === "m" ? "metres" : "degrees";
  // A band that reaches an end of the range covers the track to its very edge (past the thumb's travel).
  const band = marks.band;
  const style = {
    "--from": String(!band ? 0 : band.from <= 0 ? -1 : band.from),
    "--to": String(!band ? 0 : band.to >= 1 ? 2 : band.to),
    "--zero": String(marks.zero ?? -1),
  } as React.CSSProperties;
  const valueText = `${formatValue(value, marks.unit)}${unusual && marks.band ? `, outside the usual training range of ${formatValue(marks.band.lo, marks.unit)} to ${formatValue(marks.band.hi, marks.unit)}` : ""}${disabled ? ", follows from the pose" : ""}`;
  return (
    <div
      className={cn("joint-control rounded-lg px-2 py-[3px] transition-colors hover:bg-(--m3-surface-container) focus-within:bg-(--m3-surface-container)")}
      data-joint={path}
      data-unusual={unusual ? "true" : undefined}
      onPointerEnter={() => {
        hover.current = true;
        sync();
      }}
      onPointerLeave={() => {
        hover.current = false;
        sync();
      }}
      onFocus={() => {
        focus.current = true;
        sync();
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        focus.current = false;
        sync();
      }}
    >
      <div className="flex items-center gap-2">
        <label id={`${id}-name`} htmlFor={`${id}-range`} className="min-w-0 flex-1 text-[12px] leading-tight font-medium text-(--m3-on-surface)">
          {name}
        </label>
        {aside}
        <span className={cn("flex shrink-0 items-center gap-0.5", unusual && "[&_input]:border-(--m3-warning) [&_input]:text-(--m3-warning)")}>
          <JointEntry value={value} path={path} label={`${name}, ${unit}`} disabled={disabled} onChange={onChange} onGestureEnd={onGestureEnd} onClamp={setClampHint} />
          <span className="w-3 text-[11px] text-(--m3-on-surface-variant)" aria-hidden="true">
            {marks.unit}
          </span>
        </span>
      </div>
      <input
        id={`${id}-range`}
        type="range"
        aria-labelledby={`${id}-name`}
        aria-valuetext={valueText}
        min={marks.min}
        max={marks.max}
        step={marks.step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          setClampHint(null);
          onChange(Number(e.target.value), true);
        }}
        onPointerUp={onGestureEnd}
        onKeyUp={onGestureEnd}
        onBlur={onGestureEnd}
        data-unusual={unusual ? "true" : undefined}
        data-band={marks.band ? undefined : "none"}
        className="joint-range"
        style={style}
      />
      <div className="flex justify-between gap-3 text-[10px] leading-3 text-(--m3-on-surface-variant)" aria-hidden="true">
        <span>
          <span className="font-mono tabular-nums">{formatValue(marks.min, marks.unit)}</span> {lo}
        </span>
        <span className="text-right">
          {hi} <span className="font-mono tabular-nums">{formatValue(marks.max, marks.unit)}</span>
        </span>
      </div>
      {unusual && marks.band ? (
        <p className="mt-1 text-[11px] leading-snug text-(--m3-warning)">
          Unusual for training: the usual range is {formatValue(marks.band.lo, marks.unit)} to {formatValue(marks.band.hi, marks.unit)}.
        </p>
      ) : null}
      {clampHint ? <p className="mt-1 text-[11px] leading-snug text-(--m3-warning)">{clampHint}</p> : null}
      {locked ? <div className="mt-1 text-[11px] leading-snug text-(--m3-on-surface-variant)">{locked}</div> : null}
      {note ? <div className="mt-1 text-[11px] leading-snug text-(--m3-on-surface-variant)">{note}</div> : null}
    </div>
  );
}

/** The key to the marks on every track, once above a list of joints: the usual training range and the unusual ends. */
export function RangeKey() {
  return (
    <span className="inline-flex items-center gap-3 text-[10px] text-(--m3-on-surface-variant)">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="joint-key-band h-1.5 w-5 rounded-full" />
        usual training range
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="joint-key-out h-1.5 w-3 rounded-full" />
        unusual
      </span>
    </span>
  );
}
