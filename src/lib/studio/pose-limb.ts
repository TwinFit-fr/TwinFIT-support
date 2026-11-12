// Limb solver in angle space: moves a hand, foot, elbow or knee to a target by searching the limb's
// own joint angles inside their range of motion (JOINT_LIMITS). What it finds is a pose like any
// other: the sliders show it, and no joint ever leaves its range.
import * as THREE from "three";
import { clampToLimit, getPoseValue, setPoseValue, type PoseAngles } from "./anatomy.ts";
import type { Logical } from "./pose-bones.ts";
import { characterDeltas } from "./pose-deltas.ts";
import { localFor } from "./pose-kinematics.ts";
import type { Rig, WorldTransform } from "./pose-types.ts";

export type Limb = "left_arm" | "right_arm" | "left_leg" | "right_leg";
export type LimbEffector = "end" | "mid";

export const LIMB_CHAIN: Record<Limb, { root: Logical; mid: Logical; end: Logical; dofs: string[] }> = {
  left_arm: { root: "LeftArm", mid: "LeftForeArm", end: "LeftHand", dofs: ["left_arm.shoulder_elevation", "left_arm.shoulder_plane", "left_arm.shoulder_rotation", "left_arm.elbow_flexion"] },
  right_arm: { root: "RightArm", mid: "RightForeArm", end: "RightHand", dofs: ["right_arm.shoulder_elevation", "right_arm.shoulder_plane", "right_arm.shoulder_rotation", "right_arm.elbow_flexion"] },
  left_leg: { root: "LeftUpLeg", mid: "LeftLeg", end: "LeftFoot", dofs: ["left_leg.hip_flexion", "left_leg.hip_abduction", "left_leg.hip_rotation", "left_leg.knee_flexion"] },
  right_leg: { root: "RightUpLeg", mid: "RightLeg", end: "RightFoot", dofs: ["right_leg.hip_flexion", "right_leg.hip_abduction", "right_leg.hip_rotation", "right_leg.knee_flexion"] },
};

/** World positions of a limb's mid and end joints for a pose, given the rest of the body (fk). */
function chainPositions(rig: Rig, fk: Map<string, WorldTransform>, pose: PoseAngles, limb: Limb): { mid: THREE.Vector3; end: THREE.Vector3 } | null {
  const chain = LIMB_CHAIN[limb];
  const names = [rig.names[chain.root], rig.names[chain.mid], rig.names[chain.end]];
  if (names.some((n) => !n)) return null;
  const deltas = characterDeltas(pose, rig);
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
    const local = localFor(rig, name, deltas[logicals[i]] ?? new THREE.Quaternion());
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
export function solveLimbAngles(rig: Rig, fk: Map<string, WorldTransform>, pose: PoseAngles, limb: Limb, effector: LimbEffector, target: THREE.Vector3): PoseAngles {
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
