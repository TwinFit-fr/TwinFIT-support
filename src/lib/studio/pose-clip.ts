/**
 * Plays a pose-angles clip on a loaded rig (clipPlayer, buildPoseClip, sampleClip), and the one
 * import point for the pose solver. Each rig is first calibrated to the anatomical position,
 * whatever its rest pose (T, A, bent limbs, bones with any axes): one correction per bone. A pose
 * is then a rotation of each bone away from that position, in the character frame, so all zeros is
 * the anatomical position on every avatar. Standing, the pelvis is placed from the legs and the
 * soles stay on the floor. Every frame of a clip is solved, not just its keyframes, so contact
 * holds between them. Works for any Mixamo-named skeleton (`mixamorigHips`, `mixamorig:Hips` or
 * plain `Hips`) whatever its units or proportions.
 *
 * Where the solver lives:
 * - pose-bones.ts       the bones a pose turns and their names on a rig
 * - pose-math.ts        shared axes and small quaternion helpers
 * - pose-types.ts       Rig, SolveContext, Solved, WorldTransform
 * - pose-calibrate.ts   the per-bone correction to the anatomical position (`calibrate`)
 * - pose-deltas.ts      angles to bone rotations (`characterDeltas`)
 * - pose-kinematics.ts  the calibrated rig (`buildRig`), bone-local rotations, forward kinematics
 * - pose-floor.ts       feet flat, standing on them, feet kept off the floor
 * - pose-ik.ts          two-bone IK on a solved pose: arms to an implement, legs to feet, arms to hands
 * - pose-limb.ts        one limb moved to a target by its own joint angles, inside their limits
 * - pose-solve.ts       the pose solver: goals, pins, planted feet (`solvePose`, `resolvePose`)
 */
import * as THREE from "three";
import { lerpPose, upgradePoseClip, type PoseAngles, type PoseClipJson } from "./anatomy.ts";
import { LOGICAL, type Logical } from "./pose-bones.ts";
import { Y } from "./pose-math.ts";
import { buildRig, forwardKinematics } from "./pose-kinematics.ts";
import { resolvePose, solvePoseCore } from "./pose-solve.ts";
import type { Rig, SolveContext } from "./pose-types.ts";
import { captureRestPose, restoreRestPose, type RestPose } from "./rest-pose.ts";
import type { AvatarSocket } from "./types";

export { captureRestPose, restoreRestPose, type RestPose };

export { LOGICAL_BONES, type Logical } from "./pose-bones.ts";
export { CLAVICLE_RISE, characterDeltas } from "./pose-deltas.ts";
export { buildRig, forwardKinematics, localFor } from "./pose-kinematics.ts";
export { LIMB_CHAIN, type Limb, type LimbEffector } from "./pose-limb.ts";
export { resolvePose, solvePose, solvePoseCore, solveWorld } from "./pose-solve.ts";
export type { Rig, SolveContext, Solved, WorldTransform } from "./pose-types.ts";

const ease = (t: number) => t * t * (3 - 2 * t);

/** A clip's keyframes ready to play on a rig: goals reached, pins solved, and the pose at any time. */
function clipPlayer(rig: Rig, clip: PoseClipJson, sockets: AvatarSocket[], stance?: PoseAngles) {
  const keys = [...clip.keyframes].sort((a, b) => a.t - b.t);
  if (!keys.length) throw new Error("The pose clip has no keyframes");
  const ctx: SolveContext = {
    twoHanded: clip.meta?.two_handed === true,
    grip: typeof clip.meta?.grip === "string" ? clip.meta.grip : null,
    sockets,
    stance: stance ?? keys[0].angles,
  };
  // The first pose is what the others are planted on: its goal is reached before anything else.
  const firstResolved = resolvePose(ctx.stance!, rig, { ...ctx, stance: undefined });
  ctx.stance = firstResolved;
  const resolved = keys.map((k, i) => (i === 0 && !stance ? firstResolved : resolvePose(k.angles, rig, ctx)));
  // Between a pelvis height set by hand and an automatic one, the automatic pose gets its number.
  const heighted = (i: number, other: number) => {
    const pose = resolved[i];
    if (pose.hips.height_m !== null || resolved[other].hips.height_m === null) return pose;
    return { ...pose, hips: { ...pose.hips, height_m: rig.hipsRestY + solvePoseCore(pose, rig, ctx).hipsOffset.y } };
  };
  const duration = Math.max(clip.duration, keys[keys.length - 1].t, 1 / clip.fps);
  const poseAt = (t: number) => {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i += 1;
    const next = Math.min(i + 1, keys.length - 1);
    const span = keys[next].t - keys[i].t;
    const u = span > 0 ? ease(Math.min(1, Math.max(0, (t - keys[i].t) / span))) : 0;
    return lerpPose(heighted(i, next), heighted(next, i), u);
  };
  return { ctx, keys, resolved, duration, poseAt };
}

/**
 * The three.js clip for a pose-angles json on this model. The angles are what is interpolated and
 * every frame is solved, so the feet stay down and the bar stays in the hands between keyframes.
 */
export function buildPoseClip(model: THREE.Object3D, saved: PoseClipJson, rest: RestPose, sockets: AvatarSocket[] = [], stance?: PoseAngles): THREE.AnimationClip {
  const clip = upgradePoseClip(saved);
  const rig = buildRig(model, rest);
  const { ctx, resolved, duration, poseAt } = clipPlayer(rig, clip, sockets, stance);
  const fps = Math.min(120, Math.max(1, clip.fps));
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Float32Array(frames);
  const bones = [...solvePoseCore(resolved[0], rig, ctx).local.keys()];
  const rot = new Map(bones.map((b) => [b, new Float32Array(frames * 4)]));
  const hips = new Float32Array(frames * 3);

  for (let f = 0; f < frames; f += 1) {
    const t = Math.min(duration, f / fps);
    times[f] = t;
    const { local, hipsPosition } = solvePoseCore(poseAt(t), rig, ctx);
    for (const bone of bones) {
      const q = local.get(bone);
      if (q) rot.get(bone)!.set([q.x, q.y, q.z, q.w], f * 4);
    }
    hips.set([hipsPosition.x, hipsPosition.y, hipsPosition.z], f * 3);
  }

  const tracks: THREE.KeyframeTrack[] = bones.map((bone) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, rot.get(bone)!));
  if (rig.names.Hips) tracks.push(new THREE.VectorKeyframeTrack(`${rig.names.Hips}.position`, times, hips));
  return new THREE.AnimationClip("pose-angles", duration, tracks);
}

export type ClipSample = {
  t: number;
  pose: PoseAngles;
  /** Every logical bone, world. */
  bones: Partial<Record<Logical, { position: THREE.Vector3; quaternion: THREE.Quaternion }>>;
  /** The lowest bone of the rig. */
  lowest: { bone: string; y: number };
  /** How much each foot carries the body, and its sole's tilt from flat, degrees. */
  feet: { side: "left" | "right"; support: number; tilt: number; ankle: THREE.Vector3 }[];
};

/** The clip solved at `count` moments: what the validator looks at. */
export function sampleClip(model: THREE.Object3D, saved: PoseClipJson, rest: RestPose, sockets: AvatarSocket[] = [], count = 24): { samples: ClipSample[]; resolved: PoseAngles[]; ankleFloor: number; anatomyFront: number } {
  const clip = upgradePoseClip(saved);
  const rig = buildRig(model, rest);
  const { ctx, resolved, duration, poseAt } = clipPlayer(rig, clip, sockets);
  const samples: ClipSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (duration * i) / Math.max(1, count - 1);
    const pose = poseAt(t);
    const core = solvePoseCore(pose, rig, ctx);
    const fk = forwardKinematics(rig, core.local, core.hipsPosition);
    const bones: ClipSample["bones"] = {};
    for (const logical of LOGICAL) {
      const w = rig.names[logical] ? fk.get(rig.names[logical]!) : undefined;
      if (w) bones[logical] = { position: w.pos, quaternion: w.quat };
    }
    samples.push({
      t,
      pose,
      bones,
      lowest: [...fk.entries()].reduce((low, [bone, w]) => (w.pos.y < low.y ? { bone, y: w.pos.y } : low), { bone: "", y: Infinity }),
      feet: rig.feet.map((foot, k) => {
        const turned = fk.get(foot.name)!.quat.clone().multiply(rig.anatomical.get(foot.name)!.clone().invert());
        return { side: foot.side, support: core.support[k] ?? 0, tilt: THREE.MathUtils.radToDeg(Y.clone().applyQuaternion(turned).angleTo(Y)), ankle: fk.get(foot.name)!.pos.clone() };
      }),
    });
  }
  return { samples, resolved, ankleFloor: rig.feet[0]?.ankleRestY ?? 0, anatomyFront: rig.feet[0]?.home.z ?? 0 };
}
