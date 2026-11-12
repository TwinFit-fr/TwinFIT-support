// Two-bone IK that overrides bones of a solved pose: arms onto a two-handed implement, legs to their feet, arms to their hands.
import * as THREE from "three";
import { palmFacing, type PoseAngles } from "./anatomy.ts";
import type { Logical } from "./pose-bones.ts";
import { DOWN, Z, arc, frameDelta, perpendicular } from "./pose-math.ts";
import { forwardKinematics } from "./pose-kinematics.ts";
import type { Rig, SolveContext, WorldTransform } from "./pose-types.ts";

/**
 * Two-bone IK of each arm onto the implement: the hand socket lands on its grip point (bar centre
 * ± half the grip width), the elbow stays on the side the pose put it (the FK elbow is the pole
 * hint), and the palm faces the bar as the catalog grip says. Overrides the upper arm and forearm
 * of the pose; everything else keeps the FK result.
 */
export function solveArmsToImplement(p: PoseAngles, rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3, ctx: SolveContext) {
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
    const wUpper = fk.get(nUpper);
    const wFore = fk.get(nFore);
    const pUpper0 = posOf(upper), pFore0 = posOf(fore), pHand0 = posOf(hand);
    if (!wUpper || !wFore || !pUpper0 || !pFore0 || !pHand0) continue;

    const L1 = pUpper0.distanceTo(pFore0);
    const socket = ctx.sockets.find((so) => so.bone === nHand);
    const socketOffset = new THREE.Vector3(...(socket?.offset ?? [0, 0, 0]));
    const grip = centre.clone().addScaledVector(barAxis, (s * imp.grip_width_m) / 2);
    const facing = palmFacing(ctx.grip, side);
    const S = wUpper.pos;

    // The hand keeps its place on the forearm, so the socket is a fixed point of the forearm
    // frame: elbow → wrist → socket. Solve the two-bone chain to that point directly (segment
    // lengths L1 and |gRest|), and the socket lands on the grip exactly. All of it measured in the
    // anatomical position: arm straight down, palm forward.
    const gRest = DOWN.clone().multiplyScalar(pFore0.distanceTo(pHand0)).add(socketOffset.clone().applyQuaternion(rig.anatomical.get(nHand)!));
    const L2 = Math.max(gRest.length(), 1e-3);
    const gRestDir = gRest.clone().normalize();

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
    // The grip decides where the palm faces the bar.
    const palm =
      facing === "neutral"
        ? new THREE.Vector3(-s, 0, 0)
        : facing === "supinated"
          ? dirG.clone().cross(barAxis)
          : barAxis.clone().cross(dirG);
    if (palm.lengthSq() < 1e-6) palm.set(0, 0, -1);
    palm.normalize();
    const qUpperWorld = arc(DOWN, dirUpper).multiply(rig.anatomical.get(nUpper)!);
    const qForeWorld = frameDelta(gRestDir, Z, dirG, palm).multiply(rig.anatomical.get(nFore)!);

    const parentUpper = rUpper.parent ? fk.get(rUpper.parent)?.quat : rig.parentWorld.get(nUpper);
    local.set(nUpper, (parentUpper ?? new THREE.Quaternion()).clone().invert().multiply(qUpperWorld));
    local.set(nFore, qUpperWorld.clone().invert().multiply(qForeWorld));
    // The hand keeps the pose's own wrist flexion relative to the forearm.
  }
}

/**
 * Two-bone IK: the end of a chain lands on its target, the mid joint stays on the side the pose
 * put it, and a straight chain bends towards `pole`. Overrides the two bones of the pose.
 */
export function reachChain(rig: Rig, local: Map<string, THREE.Quaternion>, fk: Map<string, WorldTransform>, root: string, mid: string, end: string, target: THREE.Vector3, pole: THREE.Vector3, hinge = false) {
  const a = fk.get(root)!;
  const b = fk.get(mid)!;
  const c = fk.get(end)!;
  const L1 = a.pos.distanceTo(b.pos);
  const L2 = b.pos.distanceTo(c.pos);
  const reach = target.clone().sub(a.pos);
  const d = THREE.MathUtils.clamp(reach.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const u = reach.normalize();
  const side = perpendicular(pole.clone().applyQuaternion(a.quat.clone().multiply(rig.anatomical.get(root)!.clone().invert())), u);
  let v = perpendicular(b.pos.clone().sub(a.pos), u);
  if (v.lengthSq() < 1e-6) v = side.clone();
  v.normalize();
  // A knee only bends one way, whatever the pose asked for.
  if (hinge && v.dot(side) < 0) v.negate();
  const alpha = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const joint = a.pos.clone().addScaledVector(u, Math.cos(alpha) * L1).addScaledVector(v, Math.sin(alpha) * L1);
  const tip = a.pos.clone().addScaledVector(u, d);
  const turnRoot = arc(b.pos.clone().sub(a.pos).normalize(), joint.clone().sub(a.pos).normalize());
  const qRoot = turnRoot.clone().multiply(a.quat);
  const oldLower = c.pos.clone().sub(b.pos).normalize().applyQuaternion(turnRoot);
  const qMid = arc(oldLower, tip.clone().sub(joint).normalize()).multiply(turnRoot).multiply(b.quat);
  const r = rig.rest.get(root)!;
  const parent = (r.parent ? fk.get(r.parent)?.quat : rig.parentWorld.get(root)) ?? new THREE.Quaternion();
  local.set(root, parent.clone().invert().multiply(qRoot));
  local.set(mid, qRoot.clone().invert().multiply(qMid));
}

/** The legs reach their feet: the ankle lands on its target, knees bend forward. */
export function reachFeet(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3, targets: (THREE.Vector3 | null)[]) {
  const fk = forwardKinematics(rig, local, hipsPosition);
  rig.feet.forEach((foot, i) => {
    if (targets[i]) reachChain(rig, local, fk, foot.thigh, foot.shank, foot.name, targets[i]!, Z, true);
  });
}

/** Hands on the floor lie flat, fingers forward: the wrist bends as far as it takes. */
export function flattenHands(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3) {
  const fk = forwardKinematics(rig, local, hipsPosition);
  const flat = frameDelta(DOWN, Z, Z, DOWN);
  for (const arm of rig.arms) {
    const world = flat.clone().multiply(rig.anatomical.get(arm.hand)!);
    local.set(arm.hand, fk.get(arm.fore)!.quat.clone().invert().multiply(world));
  }
}

/** The arms reach their hands: elbows bend back. */
export function reachHands(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3, targets: (THREE.Vector3 | null)[]) {
  const fk = forwardKinematics(rig, local, hipsPosition);
  const back = Z.clone().negate();
  rig.arms.forEach((arm, i) => {
    if (targets[i]) reachChain(rig, local, fk, arm.upper, arm.fore, arm.hand, targets[i]!, back);
  });
}
