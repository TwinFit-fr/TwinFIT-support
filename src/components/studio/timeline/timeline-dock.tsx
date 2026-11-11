"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { stepKey, togglePlayback } from "@/lib/studio/playback";
import { useStudioStore } from "@/lib/studio/store";
import { adjacentKey, formatSeconds, keyAt, poseName } from "@/lib/studio/timeline";
import { cn } from "@/lib/utils";
import { IconButton } from "../ui";
import { TimelineTrack } from "./timeline-track";
import { useStageTime, useTimelineModel, type TimelineModel } from "./use-timeline";

const SPEEDS = [0.25, 0.5, 1, 2];

/** Current and total time, the frame, and what the stage shows at that moment. */
function Readout({ model }: { model: TimelineModel }) {
  const time = useStageTime(model);
  const playing = useStudioStore((s) => s.playing);
  const frame = Math.round(time * model.fps);
  const frames = Math.round(model.duration * model.fps);
  const on = keyAt(model.keys, time, model.tolerance);
  const state = model.kind !== "draft" ? null : playing ? { text: "Playing", tone: "play" } : on >= 0 ? { text: poseName(model.keys[on].pose, model.labels), tone: "key" } : { text: "In-between", tone: "between" };
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="whitespace-nowrap font-mono text-(length:--studio-text-sm) tabular-nums text-(--m3-on-surface)">
        {formatSeconds(time, 2).replace(" s", "")}
        <span className="text-(--m3-on-surface-variant)"> / {formatSeconds(model.duration, 2)}</span>
      </span>
      <span className="hidden whitespace-nowrap font-mono text-(length:--studio-text-xs) tabular-nums text-(--m3-on-surface-variant) @[40rem]/dock:inline">
        frame {frame} / {frames}
      </span>
      {state ? (
        <span
          data-timeline-state={state.tone}
          className={cn(
            "min-w-0 truncate rounded-full px-2 py-0.5 text-(length:--studio-text-xs) font-medium",
            state.tone === "key" && "bg-(--m3-primary)/15 text-(--m3-primary)",
            state.tone === "between" && "bg-(--m3-warning)/15 text-(--m3-warning)",
            state.tone === "play" && "bg-(--m3-surface-container-highest) text-(--m3-on-surface-variant)",
          )}
        >
          {state.text}
        </span>
      ) : null}
    </div>
  );
}

/** Previous key, play / pause, next key. */
function Transport({ model }: { model: TimelineModel }) {
  const playing = useStudioStore((s) => s.playing);
  const time = useStageTime(model);
  const hasPrev = adjacentKey(model.keys, time, -1, model.tolerance) >= 0;
  const hasNext = adjacentKey(model.keys, time, 1, model.tolerance) >= 0;
  return (
    <div className="flex items-center gap-0.5">
      <IconButton label="Previous key pose ( , )" onClick={() => stepKey(-1)} disabled={!hasPrev} aria-keyshortcuts="," className="h-8 w-8">
        <SkipBack className="h-4 w-4" />
      </IconButton>
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={playing ? "Pause (Space)" : "Play (Space)"}
        title={playing ? "Pause where it is (Space)" : "Play from the playhead (Space)"}
        aria-keyshortcuts="Space"
        className="studio-state inline-flex h-8 w-10 cursor-pointer items-center justify-center rounded-full bg-(--m3-secondary-container) text-(--m3-on-secondary-container) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <IconButton label="Next key pose ( . )" onClick={() => stepKey(1)} disabled={!hasNext} aria-keyshortcuts="." className="h-8 w-8">
        <SkipForward className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

function SpeedButton() {
  const speed = useStudioStore((s) => s.speed);
  const setSpeed = useStudioStore((s) => s.setSpeed);
  const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  return (
    <button
      type="button"
      onClick={() => setSpeed(next)}
      aria-label={`Playback speed ${speed}×, switch to ${next}×`}
      title="Playback speed"
      className="studio-state h-8 min-w-12 cursor-pointer rounded-full px-2 font-mono text-(length:--studio-text-xs) tabular-nums text-(--m3-on-surface-variant) outline-none hover:text-(--m3-on-surface) focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
    >
      {speed}×
    </button>
  );
}

/**
 * The timeline in the dock under the stage, for the pose draft or clip that is open: the
 * transport and time readout on top, then the ruler in seconds, one marker per key pose and the
 * playhead, and the loop mode at the end. Comma and period jump between key poses anywhere.
 */
export function TimelineDock() {
  const model = useTimelineModel();
  useShortcuts({ ",": () => stepKey(-1), ".": () => stepKey(1) }, model?.kind === "draft");
  if (!model) return null;
  return (
    <div className="@container/dock flex min-h-0 flex-1 flex-col" data-timeline={model.kind}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-(--m3-outline-variant) px-2">
        <h2 className="hidden px-1 text-(length:--studio-text-2xs) font-semibold uppercase tracking-[0.14em] text-(--m3-on-surface-variant) @[34rem]/dock:block">Timeline</h2>
        <Transport model={model} />
        <Readout model={model} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {model.kind === "draft" ? (
            <span className="hidden whitespace-nowrap text-(length:--studio-text-xs) text-(--m3-on-surface-variant) @[52rem]/dock:inline">
              {model.keys.filter((k) => !k.repeat).length} key poses · drag the playhead to scrub
            </span>
          ) : null}
          <SpeedButton />
        </div>
      </div>
      <TimelineTrack model={model} />
    </div>
  );
}
