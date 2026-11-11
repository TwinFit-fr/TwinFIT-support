"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { LoopMode } from "@/lib/studio/anatomy";
import { useStudioStore } from "@/lib/studio/store";
import { useTimelineClock } from "@/lib/studio/timeline-clock";
import { heldKeyTime, keyTolerance, timelineKeys, type TimelineKey } from "@/lib/studio/timeline";

/** What the timeline draws: the editor's draft (keys, loop mode, names) or a plain clip (a ruler only). */
export type TimelineModel = {
  kind: "draft" | "clip";
  keys: TimelineKey[];
  duration: number;
  fps: number;
  labels: string[] | null;
  /** The draft's loop mode; null for a plain clip, which simply loops. */
  mode: LoopMode | null;
  /** The pose selected in the editor; null for a plain clip. */
  keyframe: number | null;
  /** Half a frame, in seconds: this close to a key is on it. */
  tolerance: number;
};

/** The timeline of what is open, or null when nothing is (the dock then takes no space). */
export function useTimelineModel(): TimelineModel | null {
  const doc = useStudioStore(
    useShallow((s) =>
      s.poseEdit
        ? { count: s.poseEdit.poses.length, durationS: s.poseEdit.durationS, mode: s.poseEdit.mode, weights: s.poseEdit.weights, fps: s.poseEdit.fps, labels: s.poseEdit.labels, keyframe: s.poseEdit.keyframe }
        : null,
    ),
  );
  const clipDuration = useTimelineClock((s) => s.clipDuration);
  const clipFps = useStudioStore((s) => s.scene.vectorFps);
  return useMemo<TimelineModel | null>(() => {
    if (doc) {
      return {
        kind: "draft",
        keys: timelineKeys({ poseCount: doc.count, durationS: doc.durationS, mode: doc.mode, weights: doc.weights }),
        duration: doc.durationS,
        fps: doc.fps,
        labels: doc.labels,
        mode: doc.mode,
        keyframe: doc.keyframe,
        tolerance: keyTolerance(doc.fps),
      };
    }
    if (clipDuration === null) return null;
    const fps = clipFps ?? 30;
    return { kind: "clip", keys: [], duration: clipDuration, fps, labels: null, mode: null, keyframe: null, tolerance: keyTolerance(fps) };
  }, [doc, clipDuration, clipFps]);
}

/** Is there anything for the timeline to show (cheap: for the workspace deciding on the dock)? */
export function useTimelineShown(): boolean {
  const editing = useStudioStore((s) => Boolean(s.poseEdit));
  const clip = useTimelineClock((s) => s.clipDuration !== null);
  return editing || clip;
}

/** The playhead now, in seconds (see stageTime in playback.ts; this is its subscribing twin). */
export function useStageTime(model: TimelineModel | null): number {
  const playing = useStudioStore((s) => s.playing);
  const scrubTime = useStudioStore((s) => s.scrubTime);
  const playTime = useTimelineClock((s) => s.playTime);
  const heldAt = useTimelineClock((s) => s.heldAt);
  if (!model) return 0;
  if (playing) return playTime;
  if (scrubTime !== null) return scrubTime;
  if (model.keyframe !== null) return heldKeyTime(model.keys, model.keyframe, heldAt, model.tolerance);
  return playTime;
}
