"use client";

import * as THREE from "three";
import {
  HIPS_HEIGHT_BY_ORIENTATION,
  clampToLimit,
  getPoseValue,
  palmFacing,
  setPoseValue,
  type ArmAngles,
  type LegAngles,
  type PoseAngles,
  type PoseClipJson,
} from "./anatomy";
import type { AvatarSocket } from "./types";

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
  // Rotations about the arm's own axis happen about world X for both arms in the T-pose, so they
  // take no side sign: palm forward (external rotation, supination) is -X for either arm.
  const arm = (a: ArmAngles, s: 1 | -1) => ({
    upper: mul(qz(s * (a.shoulder_abduction - 90)), qy(-s * a.shoulder_flexion), qx(-a.shoulder_rotation)),
    fore: mul(qy(-s * a.elbow_flexion), qx(a.forearm_pronation)),
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

/** What a clip needs beyond the angles: whether the arms reach a two-handed implement, and how. */
export type SolveContext = {
  twoHanded: boolean;
  grip: string | null;
  sockets: AvatarSocket[];
};

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

type WorldTransform = { pos: THREE.Vector3; quat: THREE.Quaternion };

/** World transform of every bone for a set of local quaternions (rest positions, hips moved). */
function forwardKinematics(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3): Map<string, WorldTransform> {
  const out = new Map<string, WorldTransform>();
  const hipsName = rig.names.Hips;
  const worldOf = (name: string): WorldTransform | null => {
    const cached = out.get(name);
    if (cached) return cached;
    const r = rig.rest.get(name);
    if (!r) return null;
    const qLocal = local.get(name) ?? r.local;
    const pLocal = (name === hipsName ? hipsPosition : r.position).clone().multiplyScalar(r.parentWorldScale);
    let parent: WorldTransform | null = r.parent ? worldOf(r.parent) : null;
    if (!parent) {
      // The bone hangs from a non-bone node (Armature, model root): recover that node's world
      // transform from the bone's rest world position.
      const pq = rig.parentWorld.get(name) ?? new THREE.Quaternion();
      const pp = r.worldPosition.clone().sub(r.position.clone().multiplyScalar(r.parentWorldScale).applyQuaternion(pq));
      parent = { pos: pp, quat: pq };
    }
    const t = { pos: parent.pos.clone().add(pLocal.applyQuaternion(parent.quat)), quat: parent.quat.clone().multiply(qLocal) };
    out.set(name, t);
    return t;
  };
  for (const name of rig.rest.keys()) worldOf(name);
  return out;
}

/** Shortest rotation taking unit vector a onto unit vector b. */
function arc(a: THREE.Vector3, b: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(a, b);
}

/** Rotation whose frame maps the rest pair (axis, normal) onto the wanted pair. */
function frameDelta(axisRest: THREE.Vector3, normalRest: THREE.Vector3, axis: THREE.Vector3, normal: THREE.Vector3): THREE.Quaternion {
  const ortho = (ax: THREE.Vector3, n: THREE.Vector3) => n.clone().sub(ax.clone().multiplyScalar(n.dot(ax))).normalize();
  const nR = ortho(axisRest, normalRest);
  const nW = ortho(axis, normal);
  const mRest = new THREE.Matrix4().makeBasis(axisRest, nR, axisRest.clone().cross(nR));
  const mWant = new THREE.Matrix4().makeBasis(axis, nW, axis.clone().cross(nW));
  return new THREE.Quaternion().setFromRotationMatrix(mWant.multiply(mRest.transpose()));
}

/**
 * Two-bone IK of each arm onto the implement: the hand socket lands on its grip point (bar centre
 * ± half the grip width), the elbow stays on the side the pose put it (the FK elbow is the pole
 * hint), and the palm faces the bar as the catalog grip says. Overrides the upper arm and forearm
 * of the pose; everything else keeps the FK result.
 */
function solveArmsToImplement(p: PoseAngles, rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3, ctx: SolveContext) {
  const imp = p.implement;
  if (!imp) return;
  const fk = forwardKinematics(rig, local, hipsPosition);
  const centre = new THREE.Vector3(0, imp.height_m, imp.forward_m);
  const barAxis = new THREE.Vector3(1, 0, 0);
  const posOf = (logical: Logical) => {
    const name = rig.names[logical];
    return name ? rig.rest.get(name)?.worldPosition : undefined;
  };

  for (const side of ["left", "right"] as const) {
    const s = side === "left" ? 1 : -1;
    const upper = side === "left" ? "LeftArm" : "RightArm";
    const fore = side === "left" ? "LeftForeArm" : "RightForeArm";
    const hand = side === "left" ? "LeftHand" : "RightHand";
    const nUpper = rig.names[upper];
    const nFore = rig.names[fore];
    const nHand = rig.names[hand];
    if (!nUpper || !nFore || !nHand) continue;
    const rUpper = rig.rest.get(nUpper)!;
    const rFore = rig.rest.get(nFore)!;
    const wUpper = fk.get(nUpper);
    const wFore = fk.get(nFore);
    const pUpper0 = posOf(upper), pFore0 = posOf(fore), pHand0 = posOf(hand);
    if (!wUpper || !wFore || !pUpper0 || !pFore0 || !pHand0) continue;

    const L1 = pUpper0.distanceTo(pFore0);
    const rHand = rig.rest.get(nHand)!;
    const socket = ctx.sockets.find((so) => so.bone === nHand);
    const socketOffset = new THREE.Vector3(...(socket?.offset ?? [0, 0, 0]));
    const grip = centre.clone().addScaledVector(barAxis, (s * imp.grip_width_m) / 2);
    const facing = palmFacing(ctx.grip, side);
    const S = wUpper.pos;

    // The hand keeps its rest pose on the forearm, so the socket is a fixed point of the forearm
    // frame: elbow → wrist → socket. Solve the two-bone chain to that point directly (segment
    // lengths L1 and |gRest|), and the socket lands on the grip exactly.
    const gRest = pHand0.clone().sub(pFore0).add(socketOffset.clone().applyQuaternion(rHand.world));
    const L2 = Math.max(gRest.length(), 1e-3);
    const gRestDir = gRest.clone().normalize();
    const axisUpperRest = pFore0.clone().sub(pUpper0).normalize();
    const palmRest = new THREE.Vector3(0, -1, 0);

    const toTarget = grip.clone().sub(S);
    const d = THREE.MathUtils.clamp(toTarget.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
    const u = toTarget.normalize();
    // Pole: where the pose already put the elbow, projected off the shoulder→target line.
    let v = wFore.pos.clone().sub(S);
    v.sub(u.clone().multiplyScalar(v.dot(u)));
    if (v.lengthSq() < 1e-6) v = new THREE.Vector3(0, -1, 0).addScaledVector(u, u.y);
    if (v.lengthSq() < 1e-6) v = new THREE.Vector3(0, 0, -1);
    v.normalize();
    const alpha = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const elbow = S.clone().addScaledVector(u, Math.cos(alpha) * L1).addScaledVector(v, Math.sin(alpha) * L1);
    const end = S.clone().addScaledVector(u, d);
    const dirUpper = elbow.clone().sub(S).normalize();
    const dirG = end.clone().sub(elbow).normalize();
    // Palm normal at rest is -Y (T-pose, palms down); the grip decides where it faces the bar.
    const palm =
      facing === "neutral"
        ? new THREE.Vector3(-s, 0, 0)
        : facing === "supinated"
          ? dirG.clone().cross(barAxis)
          : barAxis.clone().cross(dirG);
    if (palm.lengthSq() < 1e-6) palm.set(0, 0, -1);
    palm.normalize();
    const qUpperWorld = arc(axisUpperRest, dirUpper).multiply(rUpper.world);
    const qForeWorld = frameDelta(gRestDir, palmRest, dirG, palm).multiply(rFore.world);

    const parentUpper = rUpper.parent ? fk.get(rUpper.parent)?.quat : rig.parentWorld.get(nUpper);
    local.set(nUpper, (parentUpper ?? new THREE.Quaternion()).clone().invert().multiply(qUpperWorld));
    local.set(nFore, qUpperWorld.clone().invert().multiply(qForeWorld));
    // The hand keeps the pose's own wrist flexion relative to the forearm.
  }
}

// ---------------------------------------------------------------------------
// Limb solver in angle space: moves a hand, foot or knee to a target by searching the limb's own
// joint angles inside their range of motion (JOINT_LIMITS). What it finds is a pose like any
// other: the sliders show it, and no joint ever leaves its range.
// ---------------------------------------------------------------------------

export type Limb = "left_arm" | "right_arm" | "left_leg" | "right_leg";
export type LimbEffector = "end" | "mid";

const LIMB_CHAIN: Record<Limb, { root: Logical; mid: Logical; end: Logical; dofs: string[] }> = {
  left_arm: { root: "LeftArm", mid: "LeftForeArm", end: "LeftHand", dofs: ["left_arm.shoulder_abduction", "left_arm.shoulder_flexion", "left_arm.shoulder_rotation", "left_arm.elbow_flexion"] },
  right_arm: { root: "RightArm", mid: "RightForeArm", end: "RightHand", dofs: ["right_arm.shoulder_abduction", "right_arm.shoulder_flexion", "right_arm.shoulder_rotation", "right_arm.elbow_flexion"] },
  left_leg: { root: "LeftUpLeg", mid: "LeftLeg", end: "LeftFoot", dofs: ["left_leg.hip_flexion", "left_leg.hip_abduction", "left_leg.hip_rotation", "left_leg.knee_flexion"] },
  right_leg: { root: "RightUpLeg", mid: "RightLeg", end: "RightFoot", dofs: ["right_leg.hip_flexion", "right_leg.hip_abduction", "right_leg.hip_rotation", "right_leg.knee_flexion"] },
};

/** World positions of a limb's mid and end joints for a pose, given the rest of the body (fk). */
function chainPositions(rig: Rig, fk: Map<string, WorldTransform>, pose: PoseAngles, limb: Limb): { mid: THREE.Vector3; end: THREE.Vector3 } | null {
  const chain = LIMB_CHAIN[limb];
  const names = [rig.names[chain.root], rig.names[chain.mid], rig.names[chain.end]];
  if (names.some((n) => !n)) return null;
  const deltas = characterDeltas(pose);
  const logicals: Logical[] = [chain.root, chain.mid, chain.end];
  const rootRest = rig.rest.get(names[0]!)!;
  let parent: WorldTransform | undefined = rootRest.parent ? fk.get(rootRest.parent) : undefined;
  if (!parent) {
    const pq = rig.parentWorld.get(names[0]!) ?? new THREE.Quaternion();
    parent = { pos: rootRest.worldPosition.clone().sub(rootRest.position.clone().multiplyScalar(rootRest.parentWorldScale).applyQuaternion(pq)), quat: pq };
  }
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < 3; i += 1) {
    const name = names[i]!;
    const r = rig.rest.get(name)!;
    const pw = rig.parentWorld.get(name) ?? new THREE.Quaternion();
    const delta = deltas[logicals[i]] ?? new THREE.Quaternion();
    const local = pw.clone().invert().multiply(delta).multiply(pw).multiply(r.local);
    const pos = parent.pos.clone().add(r.position.clone().multiplyScalar(r.parentWorldScale).applyQuaternion(parent.quat));
    const quat = parent.quat.clone().multiply(local);
    positions.push(pos);
    parent = { pos, quat };
  }
  return { mid: positions[1], end: positions[2] };
}

/**
 * Coordinate descent over the limb's joint angles (clamped to their range of motion) so that its
 * end (hand / foot) or mid joint (elbow / knee) comes as close as the range allows to `target`.
 */
function solveLimbAngles(rig: Rig, fk: Map<string, WorldTransform>, pose: PoseAngles, limb: Limb, effector: LimbEffector, target: THREE.Vector3): PoseAngles {
  const chain = LIMB_CHAIN[limb];
  const dofs = effector === "mid" ? chain.dofs.slice(0, 3) : chain.dofs;
  const errorOf = (p: PoseAngles) => {
    const c = chainPositions(rig, fk, p, limb);
    return c ? (effector === "mid" ? c.mid : c.end).distanceToSquared(target) : Infinity;
  };
  let best = pose;
  let bestErr = errorOf(best);
  if (!Number.isFinite(bestErr)) return pose;
  let step = 24;
  for (let iter = 0; iter < 120 && step >= 0.2 && bestErr > 1e-8; iter += 1) {
    let improved = false;
    for (const dof of dofs) {
      const current = getPoseValue(best, dof) ?? 0;
      for (const sign of [1, -1]) {
        const candidate = clampToLimit(dof, current + sign * step);
        if (candidate === current) continue;
        const trial = setPoseValue(best, dof, candidate);
        const err = errorOf(trial);
        if (err < bestErr - 1e-9) {
          best = trial;
          bestErr = err;
          improved = true;
          break;
        }
      }
    }
    if (!improved) step /= 2;
  }
  return best;
}

/** Pinned points become limb angles before anything is drawn: feet and hands as end targets, knees as mid targets. */
function applyAnchors(p: PoseAngles, rig: Rig, ctx: SolveContext): PoseAngles {
  const anchors = p.anchors;
  if (!anchors || !Object.keys(anchors).length) return p;
  let pose = p;
  // The pelvis height follows the leg angles when standing, so solve, re-read the body, solve again.
  for (let pass = 0; pass < 5; pass += 1) {
    const core = solvePoseCore(pose, rig, ctx);
    const fk = forwardKinematics(rig, core.local, core.hipsPosition);
    for (const side of ["left", "right"] as const) {
      const foot = anchors[`${side}_foot`];
      const knee = anchors[`${side}_knee`];
      const hand = anchors[`${side}_hand`];
      if (foot) pose = solveLimbAngles(rig, fk, pose, `${side}_leg`, "end", new THREE.Vector3(...foot));
      else if (knee) pose = solveLimbAngles(rig, fk, pose, `${side}_leg`, "mid", new THREE.Vector3(...knee));
      if (hand && !(ctx.twoHanded && p.implement)) pose = solveLimbAngles(rig, fk, pose, `${side}_arm`, "end", new THREE.Vector3(...hand));
    }
  }
  return pose;
}

/**
 * Move a limb so its hand / foot (or elbow / knee) reaches a world point, inside every joint's
 * range of motion: the pose with the new angles, for the editor to keep.
 */
export function solveLimbToTarget(
  model: THREE.Object3D,
  rest: RestPose,
  pose: PoseAngles,
  ctx: SolveContext,
  limb: Limb,
  effector: LimbEffector,
  target: [number, number, number],
): PoseAngles {
  const rig = buildRig(model, rest);
  const core = solvePoseCore(pose, rig, ctx);
  const fk = forwardKinematics(rig, core.local, core.hipsPosition);
  return solveLimbAngles(rig, fk, pose, limb, effector, new THREE.Vector3(...target));
}

function solvePose(p: PoseAngles, rig: Rig, ctx: SolveContext): Solved {
  return solvePoseCore(applyAnchors(p, rig, ctx), rig, ctx);
}

/** Angles → bone rotations and hips position (plus the bar IK); the anchors are applied before this. */
function solvePoseCore(p: PoseAngles, rig: Rig, ctx: SolveContext): Solved {
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
    // A pelvis height set by hand wins; otherwise standing derives it from the legs (feet on the
    // floor) and any other support takes the orientation's default.
    const standing = p.orientation === "standing" ? standingHips(p, rig) : null;
    const target = {
      y: p.hips.height_m ?? standing?.y ?? HIPS_HEIGHT_BY_ORIENTATION[p.orientation as Exclude<typeof p.orientation, "standing">] ?? 0.9,
      z: standing?.z ?? p.hips.forward_m,
    };
    // World metres → the parent's local frame and units (a Mixamo rig sits in centimetres under a scaled Armature).
    const deltaWorld = new THREE.Vector3(0, target.y - rig.hipsRestY, target.z);
    const pw = rig.parentWorld.get(hipsName) ?? new THREE.Quaternion();
    deltaWorld.applyQuaternion(pw.clone().invert()).divideScalar(hipsRest.parentWorldScale || 1);
    hipsPosition.add(deltaWorld);
  }
  if (ctx.twoHanded && p.implement) solveArmsToImplement(p, rig, local, hipsPosition, ctx);
  return { local, hipsPosition };
}

/** World position of the pinnable points of a pose on this rig (what the editor pins to). */
export function probePose(model: THREE.Object3D, rest: RestPose, pose: PoseAngles, ctx: { twoHanded: boolean; grip: string | null; sockets: AvatarSocket[] }): Record<string, [number, number, number]> {
  const rig = buildRig(model, rest);
  const { local, hipsPosition } = solvePose(pose, rig, ctx);
  const fk = forwardKinematics(rig, local, hipsPosition);
  const out: Record<string, [number, number, number]> = {};
  const read = (id: string, logical: Logical) => {
    const name = rig.names[logical];
    const t = name ? fk.get(name) : undefined;
    if (t) out[id] = [+t.pos.x.toFixed(3), +t.pos.y.toFixed(3), +t.pos.z.toFixed(3)];
  };
  read("hips", "Hips");
  read("left_foot", "LeftFoot");
  read("right_foot", "RightFoot");
  read("left_hand", "LeftHand");
  read("right_hand", "RightHand");
  read("left_knee", "LeftLeg");
  read("right_knee", "RightLeg");
  return out;
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** The three.js clip for a pose-angles json on this model. */
export function buildPoseClip(model: THREE.Object3D, clip: PoseClipJson, rest: RestPose, sockets: AvatarSocket[] = []): THREE.AnimationClip {
  const rig = buildRig(model, rest);
  const keys = [...clip.keyframes].sort((a, b) => a.t - b.t);
  if (!keys.length) throw new Error("The pose clip has no keyframes");
  const ctx: SolveContext = {
    twoHanded: clip.meta?.two_handed === true,
    grip: typeof clip.meta?.grip === "string" ? clip.meta.grip : null,
    sockets,
  };
  const solved = keys.map((k) => solvePose(k.angles, rig, ctx));
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
