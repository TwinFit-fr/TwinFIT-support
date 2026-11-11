"use client";

import { memo, useId, useMemo, useRef } from "react";
import { seek, selectKey, stepFrames, stepKey } from "@/lib/studio/playback";
import { useStudioStore } from "@/lib/studio/store";
import { clampTime, describeTime, formatSeconds, keyAt, poseName, rulerTicks, snapToKey, spanAt, type TimelineKey } from "@/lib/studio/timeline";
import { cn } from "@/lib/utils";
import { useElementSize } from "../shell/use-element-size";
import { LoopCap } from "./loop-cap";
import { useStageTime, type TimelineModel } from "./use-timeline";

/** Room left and right of the time span, so the first and last keys are drawn whole. */
const PAD = 22;
/** A scrub this close to a key (px) lands on it, so a key pose is easy to stop on; Shift scrubs freely. */
const SNAP_PX = 7;
const RULER_H = "h-6";

type Scale = { width: number; x: (t: number) => number; duration: number };

function tickLabel(t: number): string {
  return `${Number(t.toFixed(2))}s`;
}

/** Seconds across the clip: labelled round steps, small ticks between, the end of the loop marked. */
const Ruler = memo(function Ruler({ scale }: { scale: Scale }) {
  const ticks = rulerTicks(scale.duration, Math.max(1, scale.width - 2 * PAD));
  return (
    <div className={cn("relative shrink-0 border-b border-(--m3-outline-variant) bg-(--m3-surface-container-lowest)", RULER_H)} aria-hidden="true">
      {ticks.map((tick) => (
        <div key={tick.t} className="absolute bottom-0" style={{ left: scale.x(tick.t) }}>
          <div className={cn("w-px", tick.major ? "h-2 bg-(--m3-on-surface-variant)/70" : "h-1 bg-(--m3-outline)")} />
          {tick.major ? (
            <span className="absolute bottom-2.5 -translate-x-1/2 whitespace-nowrap font-mono text-(length:--studio-text-2xs) tabular-nums text-(--m3-on-surface-variant)">{tickLabel(tick.t)}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
});

/** Faint columns under the ruler's labelled ticks, so a key's time can be read off the lane. */
const LaneGrid = memo(function LaneGrid({ scale }: { scale: Scale }) {
  const ticks = rulerTicks(scale.duration, Math.max(1, scale.width - 2 * PAD)).filter((t) => t.major);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {ticks.map((tick) => (
        <div key={tick.t} className="absolute inset-y-0 w-px bg-(--m3-outline-variant)/50" style={{ left: scale.x(tick.t) }} />
      ))}
      {/* The loop: a rail from the start to the end of the clip. */}
      <div className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-(--m3-outline)/80" style={{ left: scale.x(0), width: Math.max(0, scale.x(scale.duration) - scale.x(0)) }} />
      <div className="absolute inset-y-2 w-px border-l border-dashed border-(--m3-outline)" style={{ left: scale.x(scale.duration) }} />
    </div>
  );
});

/**
 * One marker per key: a numbered block at the key's time and the pose's name beside it (as far
 * as the next key leaves room). A pose reached again (a boomerang's way back, a cycle's return
 * to the start) is drawn hollow. Each is a button that selects the pose and puts the playhead there.
 */
const KeyMarkers = memo(function KeyMarkers({ keys, labels, keyframe, scale }: { keys: TimelineKey[]; labels: string[] | null; keyframe: number | null; scale: Scale }) {
  const nameOf = (key: TimelineKey) => (key.repeat ? "" : (labels?.[key.pose]?.trim() ?? ""));
  // A name goes right of its block; only the last key's goes left (nothing is right of the clip's end),
  // and then it shares the gap with the key before it.
  const last = keys.length - 1;
  const lastFlips = last > 0 && Boolean(nameOf(keys[last])) && scale.width - scale.x(keys[last].t) - 20 < 44;
  return (
    <>
      {keys.map((key, i) => {
        const at = scale.x(key.t);
        const next = i < last ? scale.x(keys[i + 1].t) : scale.width;
        const prev = i > 0 ? scale.x(keys[i - 1].t) : 0;
        const name = nameOf(key);
        const flip = i === last && lastFlips;
        const shared = i === last - 1 && lastFlips;
        // Room for the name: from this block's edge to the next block's, less a small gap (blocks are 22 px).
        const room = Math.floor(flip ? (at - prev) / 2 - 26 : shared ? (next - at) / 2 - 26 : next - at - 40);
        const selected = key.pose === keyframe;
        return (
          <button
            key={`${i}-${key.pose}`}
            type="button"
            data-timeline-key={key.pose}
            data-repeat={key.repeat || undefined}
            aria-current={selected && !key.repeat ? "true" : undefined}
            aria-label={`${poseName(key.pose, labels)} at ${formatSeconds(key.t, 2)}${key.repeat ? ", reached again" : ""}`}
            title={`${poseName(key.pose, labels)} · ${formatSeconds(key.t, 2)}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => selectKey(keys, i)}
            className={cn("group absolute top-1/2 z-10 flex h-7 -translate-y-1/2 cursor-pointer items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)", flip && "flex-row-reverse")}
            style={flip ? { right: scale.width - at - 11 } : { left: at - 11 }}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex h-[22px] min-w-[22px] items-center justify-center rounded-[6px] border px-1 font-mono text-[11px] font-semibold tabular-nums transition-colors",
                key.repeat
                  ? selected
                    ? "border-dashed border-(--m3-primary) bg-(--m3-surface-container) text-(--m3-primary)"
                    : "border-dashed border-(--m3-outline) bg-(--m3-surface-container) text-(--m3-on-surface-variant) group-hover:border-(--m3-primary)"
                  : selected
                    ? "border-transparent bg-(--m3-primary) text-(--m3-on-primary) shadow-[var(--studio-glow)]"
                    : "border-(--m3-primary)/40 bg-(--m3-primary-container) text-(--m3-on-primary-container) group-hover:border-(--m3-primary)",
              )}
            >
              {key.pose + 1}
            </span>
            {name && room >= 28 ? (
              <span
                aria-hidden="true"
                className={cn("truncate rounded-sm bg-(--m3-surface-container-low) px-1 py-0.5 text-(length:--studio-text-xs) leading-4", selected ? "font-semibold text-(--m3-on-surface)" : "text-(--m3-on-surface-variant) group-hover:text-(--m3-on-surface)")}
                style={{ maxWidth: room }}
              >
                {name}
              </span>
            ) : null}
          </button>
        );
      })}
    </>
  );
});

/** The two keys an in-between blends, lit on the rail. */
function BlendSpan({ model, time, scale }: { model: TimelineModel; time: number; scale: Scale }) {
  const { from, to } = spanAt(model.keys, time);
  if (from < 0 || from === to) return null;
  const a = scale.x(model.keys[from].t);
  const b = scale.x(model.keys[to].t);
  return <div aria-hidden="true" className="pointer-events-none absolute top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-(--m3-warning)/45" style={{ left: a, width: b - a }} />;
}

/**
 * The ruler, the key lane and the playhead. Press anywhere on them and drag to scrub (keys pull
 * the playhead within a few pixels; hold Shift to scrub freely); the playhead itself is a slider:
 * arrows move a frame (Shift: ten), Page Up / Page Down jump to the next / previous key, Home and
 * End go to the start and the end.
 */
export function TimelineTrack({ model }: { model: TimelineModel }) {
  const area = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const scrubbing = useRef<number | null>(null);
  const helpId = useId();
  const { width } = useElementSize(area);
  const inner = Math.max(1, width - 2 * PAD);
  const duration = model.duration;
  // One scale per size and length, so the ruler and the markers do not redraw as the playhead moves.
  const scale = useMemo<Scale>(() => ({ width, duration, x: (t: number) => PAD + (duration > 0 ? clampTime(t, duration) / duration : 0) * inner }), [width, duration, inner]);
  const time = useStageTime(model);
  const inBetween = useStudioStore((s) => !s.playing && s.scrubTime !== null) && model.kind === "draft";

  const timeAt = (clientX: number, free: boolean) => {
    const box = area.current!.getBoundingClientRect();
    const t = clampTime(((clientX - box.left - PAD) / inner) * duration, duration);
    return free ? t : snapToKey(model.keys, t, (SNAP_PX / inner) * duration);
  };
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || !area.current) return;
    event.preventDefault();
    area.current.setPointerCapture(event.pointerId);
    scrubbing.current = event.pointerId;
    // The playhead takes the focus so the arrow keys go on from here; its ring shows once a key is used.
    handle.current?.setAttribute("data-pointer", "");
    handle.current?.focus({ preventScroll: true });
    seek(timeAt(event.clientX, event.shiftKey));
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (scrubbing.current !== event.pointerId) return;
    seek(timeAt(event.clientX, event.shiftKey));
  };
  const endScrub = (event: React.PointerEvent) => {
    if (scrubbing.current !== event.pointerId) return;
    scrubbing.current = null;
    area.current?.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    handle.current?.removeAttribute("data-pointer");
    const big = event.shiftKey ? 10 : 1;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => stepFrames(-big),
      ArrowDown: () => stepFrames(-big),
      ArrowRight: () => stepFrames(big),
      ArrowUp: () => stepFrames(big),
      PageUp: () => stepKey(1),
      PageDown: () => stepKey(-1),
      Home: () => seek(0),
      End: () => seek(duration),
    };
    const act = actions[event.key];
    if (!act) return;
    event.preventDefault();
    event.stopPropagation();
    act();
  };

  const at = scale.x(time);
  const onKey = model.keys.length > 0 && keyAt(model.keys, time, model.tolerance) >= 0;
  const valueText = describeTime(model.keys, time, duration, model.labels, model.tolerance);
  return (
    <div className="flex min-h-0 flex-1">
      <div
        ref={area}
        className="relative min-w-0 flex-1 cursor-ew-resize touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        data-timeline-track
      >
        <div className="flex h-full flex-col">
          {width > 0 ? <Ruler scale={scale} /> : <div className={cn("shrink-0 border-b border-(--m3-outline-variant)", RULER_H)} />}
          <div className="relative min-h-11 flex-1">
            {width > 0 ? (
              <>
                <LaneGrid scale={scale} />
                {inBetween ? <BlendSpan model={model} time={time} scale={scale} /> : null}
                <KeyMarkers keys={model.keys} labels={model.labels} keyframe={model.keyframe} scale={scale} />
              </>
            ) : null}
          </div>
        </div>
        {width > 0 ? (
          <>
            {/* The playhead: a line through the lane and, on the ruler, the handle that is the slider. */}
            <div aria-hidden="true" className="pointer-events-none absolute bottom-0 top-6 z-[5] w-0.5 -translate-x-1/2 bg-(--m3-error)" style={{ left: at }} />
            <div
              ref={handle}
              role="slider"
              tabIndex={0}
              aria-label="Playhead"
              aria-valuemin={0}
              aria-valuemax={Number(duration.toFixed(2))}
              aria-valuenow={Number(time.toFixed(2))}
              aria-valuetext={valueText}
              aria-describedby={helpId}
              aria-keyshortcuts="ArrowLeft ArrowRight PageUp PageDown Home End"
              onKeyDown={onKeyDown}
              onBlur={() => handle.current?.removeAttribute("data-pointer")}
              data-playhead
              data-on-key={onKey || undefined}
              className="absolute top-0.5 z-30 flex h-5 -translate-x-1/2 cursor-ew-resize items-center rounded-[5px] bg-(--m3-error) px-1.5 font-mono text-[10px] font-semibold tabular-nums text-[#3d0905] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.8)] outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--m3-surface-container-lowest) data-pointer:focus-visible:ring-0 data-pointer:focus-visible:ring-offset-0"
              style={{ left: Math.min(Math.max(at, 22), width - 22) }}
            >
              {time.toFixed(2)}
            </div>
          </>
        ) : null}
        <p id={helpId} className="sr-only">
          Left and Right arrows move one frame, with Shift ten. Page Up and Page Down, or the period and comma keys, jump to the next and previous key pose. Home and End go to the start and the end.
        </p>
      </div>
      <LoopCap model={model} />
    </div>
  );
}
