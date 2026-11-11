"use client";

import { useCallback } from "react";
import type { PoseAngles } from "@/lib/studio/anatomy";
import { shownValue, type ShownValue } from "@/lib/studio/joint-props";
import { applyPoseEdit } from "@/lib/studio/pose-drag";
import { useStudioStore } from "@/lib/studio/store";

/** A foot this far above the other (metres) is off the floor, and its ankle is the animator's again. */
const RAISED_M = 0.08;

export type JointEdit = {
  pose: PoseAngles;
  index: number;
  mirror: boolean;
  /** What a control shows for this path (the solved pelvis height on Auto, a flat-footed ankle). */
  shown: (path: string) => ShownValue;
  /** Set a field by the same rule as a drag on the stage (Mirror, goals: pose-drag.ts); `gesture` folds a drag into one undo step. */
  change: (path: string, value: number, gesture: boolean) => void;
  endGesture: () => void;
  /** Replace the held pose (a pin, Auto height, Flat feet). */
  setPose: (pose: PoseAngles) => void;
};

/** The joint controls' view of the pose the editor holds; null while no editor is open. */
export function useJointEdit(): JointEdit | null {
  const draft = useStudioStore((s) => s.poseEdit);
  const hipsY = useStudioStore((s) => s.poseProbe.hips?.[1]);
  const leftFootY = useStudioStore((s) => s.poseProbe.left_foot?.[1]);
  const rightFootY = useStudioStore((s) => s.poseProbe.right_foot?.[1]);
  const updatePose = useStudioStore((s) => s.updatePose);
  const endGesture = useStudioStore((s) => s.endPoseGesture);
  const pose = draft?.poses[draft.keyframe];
  const index = draft?.keyframe ?? 0;
  const mirror = draft?.mirror ?? false;
  const change = useCallback(
    (path: string, value: number, gesture: boolean) => {
      if (pose) updatePose(index, applyPoseEdit(pose, { [path]: value }, { mirror }), gesture);
    },
    [pose, index, mirror, updatePose],
  );
  const setPose = useCallback((next: PoseAngles) => updatePose(index, next), [index, updatePose]);
  if (!pose) return null;
  /** Standing with flat feet, this foot on the floor: its ankle is derived. */
  const flatFoot = (side: "left" | "right") => {
    if (pose.orientation !== "standing" || pose.feet_flat === false) return false;
    const own = side === "left" ? leftFootY : rightFootY;
    const other = side === "left" ? rightFootY : leftFootY;
    return own === undefined || other === undefined || own - other < RAISED_M;
  };
  return { pose, index, mirror, shown: (path) => shownValue(pose, path, { hipsY, flatFoot }), change, endGesture, setPose };
}
