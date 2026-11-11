"use client";

import { useDragModeStore } from "@/lib/studio/drag-mode";
import { giveBack, isPinnable, pointStates, withPin } from "@/lib/studio/point-state";
import { mirrorApplies } from "@/lib/studio/pose-drag";
import { POINT_LABEL, mirrorPoint, type PointId } from "@/lib/studio/pose-points";
import { useStudioStore } from "@/lib/studio/store";
import { heldWithAuto } from "./hooks/use-point-marks";
import { noAutoWords } from "./point-mark";

/**
 * What the stage shortcuts and the point properties do to the selected point, in one place so
 * both stay in step: give it back to the automatic pose, pin or unpin it. Each is one undo step
 * and returns what to announce.
 */

/** The point's joints back to the automatic pose of the held pose (one undo step). */
export function giveBackPoint(point: PointId): string {
  const state = useStudioStore.getState();
  const held = heldWithAuto(state.poseEdit, useDragModeStore.getState().exercise);
  const name = POINT_LABEL[point];
  if (!held?.pose || !held.auto) return `${name}: ${noAutoWords(held?.missing ?? null).replace(/^./, (c) => c.toLowerCase())}`;
  const states = pointStates(held.pose, held.auto);
  // Mirror on: the other side goes back too, as a change here is copied there (not a standing leg, which moves alone).
  const other = state.poseEdit?.mirror && mirrorApplies(held.pose, point) ? mirrorPoint(point) : null;
  const both = other && states[other] === "set" ? other : null;
  if (states[point] === "automatic" && !both) return `${name} is already automatic.`;
  let next = giveBack(held.pose, held.auto, point);
  if (both) next = giveBack(next, held.auto, both);
  state.updatePose(held.index, next);
  return `${both ? `${name} and ${POINT_LABEL[both].toLowerCase()} are` : `${name} is`} back to automatic. Undo with Ctrl+Z.`;
}

/** Pin the point where it is drawn now, or unpin it (one undo step). */
export function setPointPin(point: PointId, pin: boolean): string {
  const state = useStudioStore.getState();
  const edit = state.poseEdit;
  const name = POINT_LABEL[point];
  if (!edit) return "";
  if (!isPinnable(point)) return `${name} cannot be pinned: only hands, knees and feet can.`;
  const pose = edit.poses[edit.keyframe];
  const next = withPin(pose, point, pin, state.poseProbe[point]);
  if (!next) return pin && !pose.anchors?.[point] ? `${name}: its position is not known yet.` : "";
  state.updatePose(edit.keyframe, next);
  return pin ? `${name} pinned: it stays where it is while you move the rest.` : `${name} unpinned.`;
}

export function togglePointPin(point: PointId): string {
  const edit = useStudioStore.getState().poseEdit;
  const pinned = Boolean(edit && isPinnable(point) && edit.poses[edit.keyframe]?.anchors?.[point]);
  return setPointPin(point, !pinned);
}
