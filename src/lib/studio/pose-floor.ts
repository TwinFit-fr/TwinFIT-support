// Feet and the floor: soles flattened on it, the pelvis placed from the feet that carry the body, a free foot kept above it.
import * as THREE from "three";
import type { PoseAngles } from "./anatomy.ts";
import type { Logical } from "./pose-bones.ts";
import { reachChain } from "./pose-ik.ts";
import { Y, Z, arc } from "./pose-math.ts";
import { forwardKinematics, localFor } from "./pose-kinematics.ts";
import type { Rig } from "./pose-types.ts";

/** How much a foot this far above the lowest one (metres) still counts as on the floor: 1, fading to 0 by 8 cm. */
function contact(height: number): number {
  return THREE.MathUtils.clamp(1 - (height - 0.03) / 0.05, 0, 1);
}

/**
 * Soles on the floor come out flat: the ankle closes the chain, in 3D, whatever the hip and knee
 * do. `weights` says how much each foot is on the floor; a foot leaving it fades to its own angle.
 */
export function flattenFeet(rig: Rig, local: Map<string, THREE.Quaternion>, deltas: Partial<Record<Logical, THREE.Quaternion>>, hipsPosition: THREE.Vector3, weights: number[]) {
  const fk = forwardKinematics(rig, local, hipsPosition);
  rig.feet.forEach((foot, i) => {
    if (!weights[i]) return;
    const turned = fk.get(foot.shank)!.quat.clone().multiply(rig.anatomical.get(foot.shank)!.clone().invert());
    const level = arc(Y.clone().applyQuaternion(turned).normalize(), Y);
    const flat = turned.clone().invert().multiply(level).multiply(turned);
    local.set(foot.name, localFor(rig, foot.name, (deltas[foot.logical] ?? new THREE.Quaternion()).clone().slerp(flat, weights[i])));
  });
}

/**
 * Standing: the feet decide where the body is. The pelvis goes where the lowest foot touches the
 * floor and the feet that carry the body stay at home. Feet not flat keep their ankles, so the
 * toes are what stays down.
 */
export function standOnFeet(
  p: PoseAngles,
  rig: Rig,
  local: Map<string, THREE.Quaternion>,
  deltas: Partial<Record<Logical, THREE.Quaternion>>,
  hipsAtRest: THREE.Vector3,
): { offset: THREE.Vector3; support: number[] } {
  const offset = new THREE.Vector3();
  if (!rig.feet.length) return { offset, support: [] };
  if (p.feet_flat !== false) {
    const free = forwardKinematics(rig, local, hipsAtRest);
    const heights = rig.feet.map((foot) => (foot.side === p.free_foot ? Infinity : free.get(foot.name)!.pos.y));
    const lowest = Math.min(...heights);
    flattenFeet(rig, local, deltas, hipsAtRest, heights.map((h) => contact(h - lowest)));
  }
  let fk = forwardKinematics(rig, local, hipsAtRest);
  if (p.feet_flat === false) {
    // Heels up: the foot bends at the toes, which stay flat on the floor.
    for (const foot of rig.feet) {
      if (!foot.toe) continue;
      const turned = fk.get(foot.name)!.quat.clone().multiply(rig.anatomical.get(foot.name)!.clone().invert());
      const level = arc(Y.clone().applyQuaternion(turned).normalize(), Y);
      local.set(foot.toe, localFor(rig, foot.toe, turned.clone().invert().multiply(level).multiply(turned)));
    }
    fk = forwardKinematics(rig, local, hipsAtRest);
  }
  const drops = rig.feet.map((foot) => {
    if (foot.side === p.free_foot) return Infinity;
    const ankle = fk.get(foot.name)!.pos.y - foot.ankleRestY;
    const toe = foot.toe ? fk.get(foot.toe)?.pos.y : undefined;
    return toe === undefined ? ankle : Math.min(ankle, toe - foot.toeRestY);
  });
  const lowest = Math.min(...drops);
  const support = drops.map((drop) => contact(drop - lowest));
  const total = support.reduce((a, b) => a + b, 0);
  rig.feet.forEach((foot, i) => {
    const pos = fk.get(foot.name)!.pos;
    offset.x += ((foot.home.x - pos.x) * support[i]) / total;
    offset.z += ((foot.home.z - pos.z) * support[i]) / total;
  });
  // A free foot leaves the body where a foot mirroring the other would: lifting it does not slide the body sideways.
  if (p.free_foot) offset.x = 0;
  offset.y = -lowest;
  return { offset, support };
}

/** A foot off the floor stays off it: a pointed rear foot is lifted out of the ground by bending its leg. */
export function keepOffFloor(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3, side: "left" | "right") {
  const fk = forwardKinematics(rig, local, hipsPosition);
  const foot = rig.feet.find((f) => f.side === side);
  if (!foot) return;
  const tip = fk.get(foot.tip)!.pos.y;
  const below = foot.tipRestY - tip;
  if (below > 0) reachChain(rig, local, fk, foot.thigh, foot.shank, foot.name, fk.get(foot.name)!.pos.clone().setY(fk.get(foot.name)!.pos.y + below), Z, true);
}
