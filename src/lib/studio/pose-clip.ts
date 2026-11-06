"use client";

import * as THREE from "three";
import {
  HIPS_HEIGHT_BY_ORIENTATION,
  type ArmAngles,
  type LegAngles,
  type PoseAngles,
  type PoseClipJson,
} from "./anatomy";

/**
 * Solves a pose-angles clip on a loaded rig: anatomical angles → per-bone quaternions in the
 * character frame → bone-local quaternions through the rig's rest pose, sampled every frame with
 * eased interpolation between keyframes. Works for any Mixamo-named skeleton (`mixamorigHips`,
 * `mixamorig:Hips` or plain `Hips`) whatever its rest rotations, units or proportions.
 */

/** Rest pose captured when the model is laid out, before any animation touches the bones. */
export type RestPose = Map<
  string,
  {
    local: THREE.Quaternion;
    position: THREE.Vector3;
    world: THREE.Quaternion;
    worldPosition: THREE.Vector3;
    /** World scale of the bone's parent: world metres → the bone's local position units. */
    parentWorldScale: number;
    parent: string | null;
  }
>;

export function captureRestPose(model: THREE.Object3D): RestPose {
  const rest: RestPose = new Map();
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    rest.set(o.name, {
      local: o.quaternion.clone(),
      position: o.position.clone(),
      world: o.getWorldQuaternion(new THREE.Quaternion()),
      worldPosition: o.getWorldPosition(new THREE.Vector3()),
      parentWorldScale: o.parent?.getWorldScale(new THREE.Vector3()).x || 1,
      parent: o.parent?.name ?? null,
    });
  });
  return rest;
}

const LOGICAL = [
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot",
] as const;
type Logical = (typeof LOGICAL)[number];

/** Resolve the rig's bone name for a logical Mixamo name. */
function resolveNames(model: THREE.Object3D): Partial<Record<Logical, string>> {
  const names: Partial<Record<Logical, string>> = {};
  for (const logical of LOGICAL) {
    for (const candidate of [`mixamorig${logical}`, `mixamorig:${logical}`, logical]) {
      if (model.getObjectByName(candidate)) {
        names[logical] = candidate;
        break;
      }
    }
  }
  return names;
}

const rad = THREE.MathUtils.degToRad;
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const qx = (deg: number) => new THREE.Quaternion().setFromAxisAngle(X, rad(deg));
const qy = (deg: number) => new THREE.Quaternion().setFromAxisAngle(Y, rad(deg));
const qz = (deg: number) => new THREE.Quaternion().setFromAxisAngle(Z, rad(deg));
const mul = (...qs: THREE.Quaternion[]) => qs.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());

/** Character-frame rotation of every bone for one pose (s = +1 left side, -1 right side). */
function characterDeltas(p: PoseAngles): Partial<Record<Logical, THREE.Quaternion>> {
  const arm = (a: ArmAngles, s: 1 | -1) => ({
    upper: mul(qz(s * (a.shoulder_abduction - 90)), qy(-s * a.shoulder_flexion), qx(s * a.shoulder_rotation)),
    fore: mul(qy(-s * a.elbow_flexion), qx(s * a.forearm_pronation)),
    hand: qz(-s * a.wrist_flexion),
  });
  const leg = (l: LegAngles, s: 1 | -1) => ({
    upper: mul(qz(s * l.hip_abduction), qx(-l.hip_flexion), qy(s * l.hip_rotation)),
    lower: qx(l.knee_flexion),
    foot: qx(-l.ankle_dorsiflexion),
  });
  const la = arm(p.left_arm, 1);
  const ra = arm(p.right_arm, -1);
  const ll = leg(p.left_leg, 1);
  const rl = leg(p.right_leg, -1);
  const spine = mul(qx(p.torso.flexion / 3), qz(-p.torso.lateral / 3), qy(p.torso.twist / 3));
  return {
    Hips: mul(qy(p.hips.yaw), qx(p.hips.pitch), qz(-p.hips.roll)),
    Spine: spine.clone(),
    Spine1: spine.clone(),
    Spine2: spine.clone(),
    Neck: mul(qx(p.head.pitch * 0.4), qy(p.head.yaw * 0.4)),
    Head: mul(qx(p.head.pitch * 0.6), qy(p.head.yaw * 0.6)),
    LeftArm: la.upper,
    LeftForeArm: la.fore,
    LeftHand: la.hand,
    RightArm: ra.upper,
    RightForeArm: ra.fore,
    RightHand: ra.hand,
    LeftUpLeg: ll.upper,
    LeftLeg: ll.lower,
    LeftFoot: ll.foot,
    RightUpLeg: rl.upper,
    RightLeg: rl.lower,
    RightFoot: rl.foot,
  };
}

type Solved = { local: Map<string, THREE.Quaternion>; hipsPosition: THREE.Vector3 };

type Rig = {
  names: Partial<Record<Logical, string>>;
  rest: RestPose;
  /** Rest world rotation of each bone's parent (identity for a bone under a non-bone node). */
  parentWorld: Map<string, THREE.Quaternion>;
  hipsRestY: number;
  legs: { thigh: number; shank: number }[];
};

function buildRig(model: THREE.Object3D, rest: RestPose): Rig {
  const names = resolveNames(model);
  const parentWorld = new Map<string, THREE.Quaternion>();
  for (const [name, r] of rest) {
    const parent = r.parent ? rest.get(r.parent) : undefined;
    if (parent) parentWorld.set(name, parent.world.clone());
    else {
      const node = model.getObjectByName(name)?.parent;
      parentWorld.set(name, node ? node.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion());
    }
  }
  const pos = (logical: Logical) => (names[logical] ? rest.get(names[logical]!)?.worldPosition : undefined);
  const hipsRestY = pos("Hips")?.y ?? 0.95;
  const legs: Rig["legs"] = [];
  for (const [up, lo, foot] of [["LeftUpLeg", "LeftLeg", "LeftFoot"], ["RightUpLeg", "RightLeg", "RightFoot"]] as const) {
    const a = pos(up), b = pos(lo), c = pos(foot);
    if (a && b && c) legs.push({ thigh: a.distanceTo(b), shank: b.distanceTo(c) });
  }
  if (!legs.length) legs.push({ thigh: hipsRestY * 0.47, shank: hipsRestY * 0.45 });
  return { names, rest, parentWorld, hipsRestY, legs };
}

/**
 * Pelvis position when standing: the leg that reaches lowest keeps its foot where it was at rest
 * (height and forward position), the whole body tilt included.
 */
function standingHips(p: PoseAngles, rig: Rig): { y: number; z: number } {
  const reach = (l: LegAngles, leg: Rig["legs"][number]) => {
    const thigh = rad(l.hip_flexion - p.hips.pitch); // forward angle of the thigh from vertical
    const shank = thigh - rad(l.knee_flexion);
    return {
      down: leg.thigh * Math.cos(thigh) + leg.shank * Math.cos(shank),
      forward: leg.thigh * Math.sin(thigh) + leg.shank * Math.sin(shank),
    };
  };
  const legs = [p.left_leg, p.right_leg].map((l, i) => reach(l, rig.legs[Math.min(i, rig.legs.length - 1)]));
  const support = legs.reduce((best, leg) => (leg.down > best.down ? leg : best), legs[0]);
  const full = rig.legs.reduce((m, leg) => Math.max(m, leg.thigh + leg.shank), 0);
  return { y: rig.hipsRestY - full + support.down, z: p.hips.forward_m - support.forward };
}

function solvePose(p: PoseAngles, rig: Rig): Solved {
  const deltas = characterDeltas(p);
  const local = new Map<string, THREE.Quaternion>();
  for (const logical of LOGICAL) {
    const name = rig.names[logical];
    const delta = deltas[logical];
    if (!name || !delta) continue;
    const r = rig.rest.get(name);
    const pw = rig.parentWorld.get(name);
    if (!r || !pw) continue;
    // local = inverse(parentWorld) · delta · parentWorld · restLocal: the delta is expressed in the
    // character frame at rest and follows the parent as it moves.
    const q = pw.clone().invert().multiply(delta).multiply(pw).multiply(r.local);
    local.set(name, q);
  }
  const hipsName = rig.names.Hips;
  const hipsRest = hipsName ? rig.rest.get(hipsName) : undefined;
  const hipsPosition = hipsRest ? hipsRest.position.clone() : new THREE.Vector3();
  if (hipsName && hipsRest) {
    const target =
      p.orientation === "standing"
        ? standingHips(p, rig)
        : { y: p.hips.height_m ?? HIPS_HEIGHT_BY_ORIENTATION[p.orientation], z: p.hips.forward_m };
    // World metres → the parent's local frame and units (a Mixamo rig sits in centimetres under a scaled Armature).
    const deltaWorld = new THREE.Vector3(0, target.y - rig.hipsRestY, target.z);
    const pw = rig.parentWorld.get(hipsName) ?? new THREE.Quaternion();
    deltaWorld.applyQuaternion(pw.clone().invert()).divideScalar(hipsRest.parentWorldScale || 1);
    hipsPosition.add(deltaWorld);
  }
  return { local, hipsPosition };
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** The three.js clip for a pose-angles json on this model. */
export function buildPoseClip(model: THREE.Object3D, clip: PoseClipJson, rest: RestPose): THREE.AnimationClip {
  const rig = buildRig(model, rest);
  const keys = [...clip.keyframes].sort((a, b) => a.t - b.t);
  if (!keys.length) throw new Error("The pose clip has no keyframes");
  const solved = keys.map((k) => solvePose(k.angles, rig));
  const duration = Math.max(clip.duration, keys[keys.length - 1].t, 1 / clip.fps);
  const fps = Math.min(120, Math.max(1, clip.fps));
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Float32Array(frames);
  const bones = [...solved[0].local.keys()];
  const rot = new Map(bones.map((b) => [b, new Float32Array(frames * 4)]));
  const hips = new Float32Array(frames * 3);
  const qa = new THREE.Quaternion();
  const pa = new THREE.Vector3();

  for (let f = 0; f < frames; f += 1) {
    const t = Math.min(duration, f / fps);
    times[f] = t;
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i += 1;
    const a = solved[i];
    const b = solved[Math.min(i + 1, solved.length - 1)];
    const span = keys[Math.min(i + 1, keys.length - 1)].t - keys[i].t;
    const u = span > 0 ? ease(Math.min(1, Math.max(0, (t - keys[i].t) / span))) : 0;
    for (const bone of bones) {
      qa.copy(a.local.get(bone)!).slerp(b.local.get(bone) ?? a.local.get(bone)!, u);
      rot.get(bone)!.set([qa.x, qa.y, qa.z, qa.w], f * 4);
    }
    pa.copy(a.hipsPosition).lerp(b.hipsPosition, u);
    hips.set([pa.x, pa.y, pa.z], f * 3);
  }

  const tracks: THREE.KeyframeTrack[] = bones.map((bone) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, rot.get(bone)!));
  if (rig.names.Hips) tracks.push(new THREE.VectorKeyframeTrack(`${rig.names.Hips}.position`, times, hips));
  return new THREE.AnimationClip("pose-angles", duration, tracks);
}
