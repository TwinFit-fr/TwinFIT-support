"use client";

import { useEffect } from "react";
import type * as THREE from "three";
import { create } from "zustand";
import type { MocapClip, RetargetReport } from "@/lib/studio/mocap";
import type { RestPose } from "@/lib/studio/rest-pose";
import { useStudioStore } from "@/lib/studio/store";

/**
 * The link between the 3D scene and the side panel for a capture on the stage: the scene puts here
 * the motion it is playing (retargeted to the avatar, cleaned up if that is on) with what the
 * retarget matched, and the panel turns it into key poses on request (hooks/use-capture-edit.ts).
 * Kept apart from the main store so the canvas never re-renders for it.
 */
export type StageCapture = {
  vectorId: string;
  avatarId: string;
  format: string;
  clip: THREE.AnimationClip;
  model: THREE.Object3D;
  rest: RestPose;
  report: RetargetReport;
};

export const useCaptureStage = create<{ current: StageCapture | null; set: (capture: StageCapture | null) => void }>((set) => ({
  current: null,
  set: (current) => set((s) => (s.current === current ? s : { current })),
}));

/** The scene's side: while a capture plays on the stage, it is what the panel can turn into key poses. */
export function usePublishCapture(input: { report: RetargetReport | null; clip: THREE.AnimationClip | null; mocap: MocapClip | null; avatarId: string | null; model: THREE.Object3D; rest: RestPose }) {
  const { report, clip, mocap, avatarId, model, rest } = input;
  const vectorId = useStudioStore((s) => s.scene.vectorId);
  const format = useStudioStore((s) => s.scene.clipFormat);
  useEffect(() => {
    if (!report || !clip || !mocap || !vectorId || !avatarId) return;
    const capture: StageCapture = { vectorId, avatarId, format: format ?? mocap.format, clip, model, rest, report };
    useCaptureStage.getState().set(capture);
    return () => {
      if (useCaptureStage.getState().current === capture) useCaptureStage.getState().set(null);
    };
  }, [report, clip, mocap, vectorId, avatarId, format, model, rest]);
}
