"use client";

import { ArrowRightLeft, ArrowRightToLine, Repeat } from "lucide-react";
import { LOOP_MODES, type LoopMode } from "@/lib/studio/anatomy";
import { useStudioStore } from "@/lib/studio/store";
import { LOOP_NAME } from "@/lib/studio/timeline";
import type { TimelineModel } from "./use-timeline";

const LOOP_ICON: Record<LoopMode, typeof Repeat> = { cycle: Repeat, pingpong: ArrowRightLeft, once: ArrowRightToLine };
const LOOP_HINT: Record<LoopMode, string> = {
  cycle: "back to pose 1",
  pingpong: "there and back",
  once: "no return",
};

/**
 * The end of the timeline: how the loop goes on after its last key (cycle, boomerang, once).
 * On a draft it is a button that switches to the next mode (undoable, like the Poses panel).
 */
export function LoopCap({ model }: { model: TimelineModel }) {
  const setOptions = useStudioStore((s) => s.setPoseEditOptions);
  const mode = model.mode;
  if (!mode) {
    return (
      <div className="flex w-28 shrink-0 flex-col justify-center gap-0.5 border-l border-(--m3-outline-variant) px-3 text-(length:--studio-text-xs)">
        <span className="flex items-center gap-1.5 font-medium text-(--m3-on-surface)">
          <Repeat className="h-3.5 w-3.5 text-(--m3-primary)" aria-hidden="true" />
          Loops
        </span>
        <span className="text-(length:--studio-text-2xs) text-(--m3-on-surface-variant)">saved clip</span>
      </div>
    );
  }
  const Icon = LOOP_ICON[mode];
  const next = LOOP_MODES[(LOOP_MODES.indexOf(mode) + 1) % LOOP_MODES.length];
  return (
    <button
      type="button"
      onClick={() => setOptions({ mode: next })}
      aria-label={`Loop: ${LOOP_NAME[mode]}, ${LOOP_HINT[mode]}. Switch to ${LOOP_NAME[next]}`}
      title={`Loop: ${LOOP_NAME[mode]} (${LOOP_HINT[mode]}). Click for ${LOOP_NAME[next]}.`}
      data-loop-mode={mode}
      className="studio-state flex w-28 shrink-0 cursor-pointer flex-col items-start justify-center gap-0.5 border-l border-(--m3-outline-variant) px-3 text-left text-(length:--studio-text-xs) outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--m3-primary)"
    >
      <span className="flex items-center gap-1.5 font-medium text-(--m3-on-surface)">
        <Icon className="h-3.5 w-3.5 text-(--m3-primary)" aria-hidden="true" />
        {LOOP_NAME[mode]}
      </span>
      <span className="text-(length:--studio-text-2xs) text-(--m3-on-surface-variant)">{LOOP_HINT[mode]}</span>
    </button>
  );
}
