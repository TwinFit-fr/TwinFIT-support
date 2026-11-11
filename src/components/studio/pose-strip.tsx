"use client";

import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { LOOP_MODES, type LoopMode } from "@/lib/studio/anatomy";
import { MAX_POSES, useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { IconButton, NumberField, Segmented, TextInput } from "./ui";

const LOOP_LABEL: Record<LoopMode, { label: string; title: string }> = {
  pingpong: { label: "Boomerang", title: "There and back through the poses: one repetition" },
  cycle: { label: "Cycle", title: "The last pose returns to the first" },
  once: { label: "Once", title: "Play the poses once, no return" },
};

/** The poses of the clip: pick, add, move, copy and remove one, its name and tempo, and how the loop plays. */
export function PoseStrip() {
  const draft = useStudioStore((s) => s.poseEdit);
  const setKeyframe = useStudioStore((s) => s.setPoseKeyframe);
  const setOptions = useStudioStore((s) => s.setPoseEditOptions);
  const setLabel = useStudioStore((s) => s.setPoseLabel);
  const setWeight = useStudioStore((s) => s.setPoseWeight);
  const duplicatePose = useStudioStore((s) => s.duplicatePose);
  const removePose = useStudioStore((s) => s.removePose);
  const movePose = useStudioStore((s) => s.movePose);
  const endGesture = useStudioStore((s) => s.endPoseGesture);
  if (!draft) return null;
  const i = draft.keyframe;
  const n = draft.poses.length;
  return (
    <div className="border-b border-(--m3-outline-variant) px-4 py-3">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {draft.poses.map((_, k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKeyframe(k)}
            aria-current={k === i ? "true" : undefined}
            className={cn(
              "studio-state flex h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border px-2 text-xs font-semibold tabular-nums",
              k === i
                ? "border-transparent bg-(--m3-primary) text-(--m3-on-primary) shadow-[var(--studio-glow)]"
                : "border-(--m3-outline-variant) bg-(--m3-surface-container) text-(--m3-on-surface-variant)",
            )}
            title={draft.labels?.[k] ? `${k + 1} · ${draft.labels[k]}` : `Pose ${k + 1}`}
          >
            {k + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => duplicatePose(i)}
          disabled={n >= MAX_POSES}
          className="studio-state flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-(--m3-outline) text-(--m3-primary) disabled:opacity-40"
          title="Add a pose after this one (a copy of it)"
          aria-label="Add a pose after this one"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-(--m3-on-surface-variant)">
        <span className="mr-auto truncate">
          Pose {i + 1} of {n}
        </span>
        <IconButton label="Move this pose earlier" onClick={() => movePose(i, -1)} disabled={i === 0} className="h-7 w-7">
          <ChevronLeft className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Move this pose later" onClick={() => movePose(i, 1)} disabled={i === n - 1} className="h-7 w-7">
          <ChevronRight className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Duplicate this pose" onClick={() => duplicatePose(i)} disabled={n >= MAX_POSES} className="h-7 w-7">
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Remove this pose" onClick={() => removePose(i)} disabled={n <= 1} className="h-7 w-7">
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      {/* Name and tempo of this pose */}
      <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
        <TextInput
          value={draft.labels?.[i] ?? ""}
          onChange={(e) => setLabel(i, e.target.value)}
          onBlur={endGesture}
          placeholder={`Name of pose ${i + 1}`}
          title="A short name for this pose, e.g. bottom or lockout"
          aria-label={`Name of pose ${i + 1}`}
          className="h-7 px-2 py-0 text-[11px]"
        />
        <label className="flex items-center gap-1 text-[10px] text-(--m3-on-surface-variant)" title="Relative time spent getting into this pose (1 = the same as the others; 2 = twice as slow)">
          tempo
          <NumberField
            aria-label={`Tempo into pose ${i + 1}`}
            min={0.1}
            max={10}
            step={0.1}
            digits={1}
            value={draft.weights?.[i] ?? 1}
            onCommit={(v) => {
              setWeight(i, v);
              endGesture();
            }}
            className="h-7 w-14 px-1.5 py-0 text-right text-[11px]"
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Segmented
          value={draft.mode}
          onChange={(mode) => setOptions({ mode })}
          size="sm"
          label="How the loop plays"
          options={LOOP_MODES.map((m) => ({ value: m, label: LOOP_LABEL[m].label, title: LOOP_LABEL[m].title }))}
        />
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-(--m3-on-surface-variant)" title="Seconds of one loop">
          <NumberField
            aria-label="Seconds of one loop"
            min={0.5}
            max={30}
            step={0.5}
            digits={1}
            value={draft.durationS}
            onCommit={(v) => setOptions({ durationS: Math.max(0.5, v) })}
            className="h-7 w-14 px-1.5 py-0 text-right text-[11px]"
          />
          s
        </label>
      </div>
    </div>
  );
}
