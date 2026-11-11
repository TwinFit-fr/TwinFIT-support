"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PoseClipJson } from "@/lib/studio/anatomy";
import { buildPoseClip, restoreRestPose, type RestPose } from "@/lib/studio/pose-clip";
import { useStudioStore } from "@/lib/studio/store";
import { useTimelineClock } from "@/lib/studio/timeline-clock";
import { wrapTime } from "@/lib/studio/timeline";
import type { AvatarSocket } from "@/lib/studio/types";

declare global {
  interface Window {
    /** Development only: how many times the editor's draft was baked into a clip, for the capture scripts. */
    __studioClipBakes?: number;
  }
}

/** The last clip baked from the editor's draft, kept while the editor holds a pose so playing or scrubbing again reuses it. */
let baked: { model: THREE.Object3D; rest: RestPose; sockets: AvatarSocket[]; source: PoseClipJson; stance: unknown; clip: THREE.AnimationClip } | null = null;

function sameSource(a: PoseClipJson, b: PoseClipJson) {
  return a.duration === b.duration && a.fps === b.fps && a.keyframes.length === b.keyframes.length && a.keyframes.every((k, i) => k.t === b.keyframes[i].t && k.angles === b.keyframes[i].angles) && JSON.stringify(a.meta) === JSON.stringify(b.meta);
}

/**
 * The editor's draft as a three.js clip on this rig, solved frame by frame once per change of the
 * draft: scrubbing, pausing and playing again sample the same clip instead of baking it anew.
 */
export function bakeDraftClip(model: THREE.Object3D, source: PoseClipJson, rest: RestPose, sockets: AvatarSocket[], stance: PoseClipJson["keyframes"][number]["angles"] | undefined): THREE.AnimationClip {
  if (baked && baked.model === model && baked.rest === rest && baked.sockets === sockets && baked.stance === stance && sameSource(baked.source, source)) return baked.clip;
  const clip = buildPoseClip(model, source, rest, sockets, stance);
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") window.__studioClipBakes = (window.__studioClipBakes ?? 0) + 1;
  baked = { model, rest, sockets, source, stance, clip };
  return clip;
}

/** Where a paused clip is sampled: just inside its end, so the last frame is not wrapped back to the first. */
const inside = (t: number, duration: number) => Math.max(0, Math.min(t, duration - 1e-4));

/**
 * Plays the clip on the stage with one mixer action per clip. Playing advances it and reports the
 * time to the timeline; paused on an in-between (or a paused clip) it is sampled at that time,
 * only when the time changes; while the editor holds a key pose there is no action (PoseRig
 * writes the pose). A new action starts where the playhead is, so playback never jumps to 0.
 * `poseFrame` (the pose editor's frame) runs after the mixer, so its points sit on the drawn bones.
 */
export function useClipPlayback({
  mixer,
  model,
  rest,
  clip,
  fallback,
  editing,
  holding,
  poseFrame,
}: {
  mixer: THREE.AnimationMixer;
  model: THREE.Object3D;
  rest: RestPose;
  /** The clip of the selected vector or the editor's baked draft; reported to the timeline. */
  clip: THREE.AnimationClip | null;
  /** The model's own first animation, played (unreported) when there is no clip. */
  fallback: THREE.AnimationClip | null;
  /** The rig editor is open: the avatar stands in its bind pose. */
  editing: boolean;
  /** The pose editor holds a key pose. */
  holding: boolean;
  poseFrame: RefObject<(() => void) | null>;
}) {
  const current = useRef<{ action: THREE.AnimationAction; duration: number; applied: number | null } | null>(null);

  useEffect(() => {
    if (editing) {
      mixer.stopAllAction();
      restoreRestPose(model, rest);
      return;
    }
    if (holding) {
      mixer.stopAllAction(); // PoseRig writes the held pose onto the bones
      return;
    }
    const active = clip ?? fallback;
    if (!active) return;
    const action = mixer.clipAction(active);
    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    const { playing, scrubTime } = useStudioStore.getState();
    const start = playing ? useTimelineClock.getState().playTime : (scrubTime ?? useTimelineClock.getState().playTime);
    mixer.setTime(inside(start, active.duration));
    current.current = { action, duration: active.duration, applied: playing ? null : start };
    const clock = useTimelineClock.getState();
    if (clip) clock.setClipDuration(clip.duration);
    return () => {
      action.stop();
      mixer.uncacheAction(active);
      mixer.uncacheClip(active);
      current.current = null;
      if (clip) useTimelineClock.getState().setClipDuration(null);
    };
  }, [mixer, model, rest, clip, fallback, editing, holding]);

  // Playback controls are read straight from the stores every frame: toggling them never re-renders the scene.
  useFrame((_, delta) => {
    const { playing, speed, edit, scrubTime } = useStudioStore.getState();
    if (edit.mode !== "off") return;
    const now = current.current;
    if (now) {
      const clock = useTimelineClock.getState();
      if (playing) {
        mixer.update(delta * speed);
        clock.setPlayTime(wrapTime(now.action.time, now.duration));
        now.applied = null;
      } else {
        const t = scrubTime ?? clock.playTime;
        if (t !== now.applied) {
          mixer.setTime(inside(t, now.duration));
          now.applied = t;
        }
      }
    }
    poseFrame.current?.();
  });
}
