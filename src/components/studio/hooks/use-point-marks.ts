"use client";

import { useMemo } from "react";
import { automaticOf, useDragModeStore } from "@/lib/studio/drag-mode";
import type { TemplateExercise } from "@/lib/studio/exercise-templates";
import { pinnedPoints, pointStates, type PointState } from "@/lib/studio/point-state";
import { POINT_IDS, type PointId } from "@/lib/studio/pose-points";
import { useStudioStore, type PoseEditState } from "@/lib/studio/store";

export type PointMarks = {
  /** Each point of the held pose against its automatic pose; null when there is none to compare with. */
  states: Record<PointId, PointState> | null;
  pinned: PointId[];
  /** Why there are no states: the poses were not built from the template, or a pose was added or removed since. */
  missing: "no-template" | "unmatched" | null;
};

/** The held pose and its automatic pose, when the poses match the template's one to one. */
export function heldWithAuto(edit: PoseEditState | null, exercise: TemplateExercise | null) {
  if (!edit) return null;
  const pose = edit.poses[edit.keyframe];
  const auto = automaticOf(edit, exercise);
  const matched = Boolean(auto && auto.length === edit.poses.length);
  return { pose, auto: matched && auto ? auto[edit.keyframe] : null, index: edit.keyframe, missing: matched ? null : auto ? ("unmatched" as const) : ("no-template" as const) };
}

/** One short string per state of the held pose, so a component re-renders only when a mark changes. */
function marksKey(edit: PoseEditState | null, exercise: TemplateExercise | null): string {
  const held = heldWithAuto(edit, exercise);
  if (!held?.pose) return "";
  const states = held.auto ? pointStates(held.pose, held.auto) : null;
  const s = states ? POINT_IDS.map((id) => (states[id] === "set" ? "s" : "a")).join("") : "-";
  return `${s}|${pinnedPoints(held.pose).join(",")}|${held.missing ?? ""}`;
}

function marksFromKey(key: string): PointMarks {
  const [s = "-", pins = "", missing = ""] = key.split("|");
  const states = s === "-" || !s ? null : (Object.fromEntries(POINT_IDS.map((id, i) => [id, s[i] === "s" ? "set" : "automatic"])) as Record<PointId, PointState>);
  return { states, pinned: pins ? (pins.split(",") as PointId[]) : [], missing: missing === "no-template" || missing === "unmatched" ? missing : null };
}

/** The state marks of the body points in the pose the editor holds (automatic, set by you, pinned). */
export function usePointMarks(): PointMarks {
  const exercise = useDragModeStore((s) => s.exercise);
  const key = useStudioStore((s) => marksKey(s.poseEdit, exercise));
  return useMemo(() => marksFromKey(key), [key]);
}
