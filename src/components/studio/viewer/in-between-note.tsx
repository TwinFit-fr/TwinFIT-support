"use client";

import { Diamond } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { draftKeys, seek } from "@/lib/studio/playback";
import { useStudioStore } from "@/lib/studio/store";
import { formatSeconds, nearestKey, poseName, spanAt } from "@/lib/studio/timeline";

/**
 * On the stage while the timeline rests between two key poses: says the body shown is an
 * in-between (not a pose you can edit), which two poses it blends, and that a drag edits the
 * nearest key pose. The button goes to that pose.
 */
export function InBetweenNote() {
  const info = useStudioStore(
    useShallow((s) => {
      if (!s.poseEdit || s.playing || s.scrubTime === null) return null;
      const keys = draftKeys(s.poseEdit);
      const { from, to } = spanAt(keys, s.scrubTime);
      const near = nearestKey(keys, s.scrubTime);
      if (from < 0 || near < 0) return null;
      return { t: s.scrubTime, a: keys[from].pose + 1, b: keys[to].pose + 1, nearAt: keys[near].t, near: poseName(keys[near].pose, s.poseEdit.labels) };
    }),
  );
  if (!info) return null;
  return (
    <div className="studio-glass pointer-events-auto flex max-w-[52ch] items-center gap-2 rounded-2xl border-(--m3-warning)/40 py-1.5 pl-3 pr-1.5 text-[11px] text-(--m3-on-surface)" data-in-between>
      <Diamond className="h-3 w-3 shrink-0 text-(--m3-warning)" aria-hidden="true" />
      <span className="min-w-0 leading-snug">
        <span className="font-semibold">In-between · {formatSeconds(info.t, 2)}</span>
        <span className="text-(--m3-on-surface-variant)">{` · pose ${info.a} → ${info.b}.`}</span>
        {/* On a short stage only the first line shows: the button already names the nearest key. */}
        <span className="stage-short-hide text-(--m3-on-surface-variant)">{` A drag edits ${info.near}, the nearest key.`}</span>
      </span>
      <button
        type="button"
        onClick={() => seek(info.nearAt)}
        className="studio-state shrink-0 cursor-pointer rounded-full bg-(--m3-secondary-container) px-2.5 py-1 font-medium text-(--m3-on-secondary-container) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
      >
        Go to {info.near.split(" · ")[0].toLowerCase()}
      </button>
    </div>
  );
}
