/** Motions for the capture tests: pose clips baked to bone rotations, as a capture would give them, with a little shake. */

import * as THREE from "three";
import { buildKeyframes, lerpPose, POSE_CLIP_VERSION, type LoopMode, type PoseAngles, type PoseClipJson } from "./anatomy.ts";
import { buildTemplate, type TemplateExercise } from "./exercise-templates.ts";
import { LOGICAL_BONES, buildPoseClip, characterDeltas, localFor, type Rig } from "./pose-clip.ts";
import type { RestPose } from "./rest-pose.ts";

/** A seeded random source in [0, 1), so a failing test fails the same way every time. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A pose clip of a template, as the editor would save it. */
export function templateClip(ex: TemplateExercise, durationS = 4, mode?: LoopMode): PoseClipJson {
  const t = buildTemplate(ex);
  const loop = mode ?? t.mode;
  return { kind: "pose-angles", version: POSE_CLIP_VERSION, fps: 30, duration: durationS, loop: loop !== "once", keyframes: buildKeyframes(t.poses, durationS, loop, t.weights), meta: { loop_mode: loop } };
}

const ease = (u: number) => u * u * (3 - 2 * u);

/** The angles a clip plays at `t` (the clip player's search and ease, no solving). */
export function clipAnglesAt(clip: PoseClipJson, t: number): PoseAngles {
  const keys = [...clip.keyframes].sort((a, b) => a.t - b.t);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i += 1;
  const next = Math.min(i + 1, keys.length - 1);
  const span = keys[next].t - keys[i].t;
  return lerpPose(keys[i].angles, keys[next].angles, span > 0 ? ease(Math.min(1, Math.max(0, (t - keys[i].t) / span))) : 0);
}

/** Bone-local rotations of a pose through the angles-to-bones mapping only (no feet planting, no reach). */
export function bonesOf(pose: PoseAngles, rig: Rig): Map<string, THREE.Quaternion> {
  const deltas = characterDeltas(pose, rig);
  const local = new Map<string, THREE.Quaternion>();
  for (const logical of LOGICAL_BONES) {
    const name = rig.names[logical];
    if (name && rig.rest.has(name)) local.set(name, localFor(rig, name, deltas[logical] ?? new THREE.Quaternion()));
  }
  return local;
}

/** Turn a rotation by a random axis, up to `deg` degrees. */
function shake(q: THREE.Quaternion, deg: number, random: () => number): THREE.Quaternion {
  const axis = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
  return q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, (random() * 2 - 1) * THREE.MathUtils.degToRad(deg)));
}

/**
 * A dense capture of a pose clip: every frame's angles through the angles-to-bones mapping, every
 * bone shaken by up to `jitterDeg`, as an AnimationClip on the rig's own bone names.
 */
export function bakeAngles(clip: PoseClipJson, rig: Rig, fps = 30, jitterDeg = 1, seed = 1): THREE.AnimationClip {
  const random = seeded(seed);
  const frames = Math.round(clip.duration * fps) + 1;
  const times = Float32Array.from({ length: frames }, (_, f) => Math.min(clip.duration, f / fps));
  const tracks = new Map<string, number[]>();
  for (const t of times) {
    for (const [name, q] of bonesOf(clipAnglesAt(clip, t), rig)) {
      const list = tracks.get(name) ?? [];
      list.push(...shake(q, jitterDeg, random).toArray());
      tracks.set(name, list);
    }
  }
  return new THREE.AnimationClip("capture", clip.duration, [...tracks].map(([name, values]) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values)));
}

/** A capture of a clip as the Studio plays it (feet planted, reach solved), every rotation shaken a little. */
export function bakeSolved(model: THREE.Object3D, rest: RestPose, clip: PoseClipJson, jitterDeg = 1, seed = 2): THREE.AnimationClip {
  const baked = buildPoseClip(model, clip, rest);
  const random = seeded(seed);
  for (const track of baked.tracks) {
    if (!track.name.endsWith(".quaternion")) continue;
    for (let k = 0; k < track.values.length; k += 4) shake(new THREE.Quaternion().fromArray(track.values, k), jitterDeg, random).toArray(track.values, k);
  }
  return baked;
}

/** The bones a baked clip moves. */
export function drivenBy(clip: THREE.AnimationClip): Set<string> {
  return new Set(clip.tracks.map((t) => t.name.slice(0, t.name.lastIndexOf("."))));
}
