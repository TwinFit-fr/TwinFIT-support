"use client";

import { useEffect } from "react";
import type * as THREE from "three";
import { isPoseClipJson, poseClipFromDraft, type PoseClipJson } from "@/lib/studio/anatomy";
import type { RestPose } from "@/lib/studio/pose-clip";
import { validatePoseClip } from "@/lib/studio/pose-validate";
import { useStudioStore, type StudioState } from "@/lib/studio/store";
import type { AvatarSocket } from "@/lib/studio/types";
import type { LoadedClip } from "./movement-clip";

/** What the checks read from the editor's draft: when none of it changes, nothing is checked again. */
function draftShape(s: StudioState) {
  const d = s.poseEdit;
  return d ? [d.poses, d.weights, d.mode, d.durationS, d.fps, d.twoHanded, d.grip, d.meta] : null;
}

const SETTLE_MS = 350;

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
      const { poseEdit, setPoseIssues } = useStudioStore.getState();
      const source = poseEdit ? poseClipFromDraft(poseEdit) : selected;
      if (!source) {
        setPoseIssues([]);
        return;
      }
      try {
        setPoseIssues(validatePoseClip(model, source, rest, sockets).issues);
      } catch {
        setPoseIssues([]);
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
    schedule();
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [model, rest, sockets, clip]);
}
