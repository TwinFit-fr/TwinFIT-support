"use client";

import { useEffect } from "react";
import type * as THREE from "three";
import { isPoseClipJson, poseClipFromDraft, type PoseAngles, type PoseClipJson } from "@/lib/studio/anatomy";
import { locateIssues, type FreeFeet, type ReportKey } from "@/lib/studio/body-issues";
import { automaticOf, useDragModeStore } from "@/lib/studio/drag-mode";
import { automaticPoses, pinnedPoints } from "@/lib/studio/point-state";
import { draftKeys } from "@/lib/studio/playback";
import type { RestPose } from "@/lib/studio/pose-clip";
import { validatePoseClip } from "@/lib/studio/pose-validate";
import { useStudioStore, type StudioState } from "@/lib/studio/store";
import type { AvatarSocket } from "@/lib/studio/types";
import type { LoadedClip } from "./movement-clip";

/** What the checks read from the editor's draft: when none of it changes, nothing is checked again. */
function draftShape(s: StudioState) {
  const d = s.poseEdit;
  return d ? [d.poses, d.weights, d.mode, d.durationS, d.fps, d.twoHanded, d.grip, d.meta, d.labels] : null;
}

const SETTLE_MS = 350;

/**
 * The feet the exercise's template lifts on purpose in each pose, for telling a lunge's rear foot
 * from a foot lifted by mistake; null when the poses do not come from the template one to one.
 */
function freeFeetOf(poseCount: number, auto: PoseAngles[] | null): FreeFeet {
  if (!auto || !auto.length || (poseCount && auto.length !== poseCount)) return null;
  return auto.map((p) => (p.orientation === "standing" && p.free_foot ? [p.free_foot] : []));
}

/**
 * The clip on screen (the editor's draft, else a selected pose clip), checked as a body on this
 * rig once the edits settle. Subscribes to the store outside React, so a drag or a slider tick
 * never re-renders the scene for it.
 */
export function usePoseChecks(model: THREE.Object3D, rest: RestPose, sockets: AvatarSocket[], clip: LoadedClip | null) {
  useEffect(() => {
    const selected: PoseClipJson | null = clip && isPoseClipJson(clip) ? clip : null;
    let timer = 0;
    const check = () => {
      const { poseEdit, setPoseChecks } = useStudioStore.getState();
      const source = poseEdit ? poseClipFromDraft(poseEdit) : selected;
      if (!source) {
        setPoseChecks([], null);
        return;
      }
      try {
        const result = validatePoseClip(model, source, rest, sockets, { locate: true });
        // The keys as the timeline draws them (a saved clip without the editor: one per keyframe).
        const keys: ReportKey[] = poseEdit ? draftKeys(poseEdit) : [...source.keyframes].sort((a, b) => a.t - b.t).map((k, i) => ({ t: k.t, pose: i }));
        const labels = poseEdit ? poseEdit.labels : Array.isArray(source.meta?.labels) ? (source.meta.labels as (string | null)[]) : null;
        const exercise = useDragModeStore.getState().exercise;
        const free = poseEdit
          ? freeFeetOf(poseEdit.poses.length, automaticOf(poseEdit, exercise))
          : freeFeetOf(0, source.meta ? automaticPoses(exercise, { poses: [], meta: source.meta }) : null);
        // A saved clip has one key per keyframe (a cycle ends on its first pose again).
        const feet = free && !poseEdit ? keys.map((k) => free[k.pose % free.length]) : free;
        // Pins by pose, in the keys' pose numbering (a saved clip has none).
        const pinned = poseEdit ? poseEdit.poses.map(pinnedPoints) : null;
        setPoseChecks(result.issues, result.located ? locateIssues(result.located, keys, labels, { freeFeet: feet, pinned }) : null);
      } catch {
        setPoseChecks([], null);
      }
    };
    const schedule = () => {
      useStudioStore.getState().markPoseChecksPending();
      window.clearTimeout(timer);
      timer = window.setTimeout(check, SETTLE_MS);
    };
    let last = draftShape(useStudioStore.getState());
    const unsubscribe = useStudioStore.subscribe((state) => {
      const next = draftShape(state);
      if (next === last || (next && last && next.every((v, i) => v === last![i]))) return;
      last = next;
      schedule();
    });
    // The template that says which feet are meant to be off the floor may arrive after the poses.
    const unsubscribeExercise = useDragModeStore.subscribe((state, prev) => {
      if (state.exercise !== prev.exercise) schedule();
    });
    schedule();
    return () => {
      unsubscribe();
      unsubscribeExercise();
      window.clearTimeout(timer);
    };
  }, [model, rest, sockets, clip]);
}
