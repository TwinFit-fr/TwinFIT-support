/**
 * How different two poses look, from the bone rotations they give (characterDeltas' frame), in
 * degrees: what the key-pose reduction and the capture's "joints within N degrees" measure.
 */

import * as THREE from "three";
import type { Logical } from "./pose-clip.ts";
import { angleBetween } from "./rotation-fit.ts";

const DEG = 180 / Math.PI;

/** Rotation of each posed bone away from the anatomical position, relative to the posed bone above it. */
export type Deltas = Partial<Record<Logical, THREE.Quaternion>>;

const ARM_CHAINS = [["LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand"], ["RightShoulder", "RightArm", "RightForeArm", "RightHand"]] as const;
const LEG_CHAINS = [["LeftUpLeg", "LeftLeg", "LeftFoot"], ["RightUpLeg", "RightLeg", "RightFoot"]] as const;
const DOWN_AXIS = new THREE.Vector3(0, -1, 0);

/**
 * The largest difference between two sets of bone rotations (characterDeltas' frame), as the eye
 * sees it, in degrees: where each limb segment points against the trunk (an elbow or a knee that
 * is not a pure hinge, or a thigh turned about itself, does not count while the joints land in
 * the same places), the full turn of the hands, feet, pelvis, spine, neck and head. Parts missing
 * from either side are skipped.
 */
export function bodyDifference(a: Deltas, b: Deltas): number {
  let worst = 0;
  const note = (d: number) => {
    if (d > worst) worst = d;
  };
  for (const l of ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder"] as const) {
    if (a[l] && b[l]) note(angleBetween(a[l]!, b[l]!));
  }
  const pointing = (qa: THREE.Quaternion, qb: THREE.Quaternion) => DOWN_AXIS.clone().applyQuaternion(qa).angleTo(DOWN_AXIS.clone().applyQuaternion(qb)) * DEG;
  const chain = (d: Deltas, base: THREE.Quaternion, bones: readonly Logical[]) => {
    const out: (THREE.Quaternion | null)[] = [];
    let q: THREE.Quaternion | null = base.clone();
    for (const l of bones) {
      q = q && d[l] ? q.clone().multiply(d[l]!) : null;
      out.push(q);
    }
    return out;
  };
  for (const [shoulder, ...bones] of ARM_CHAINS) {
    const ca = chain(a, a[shoulder] ?? new THREE.Quaternion(), bones);
    const cb = chain(b, b[shoulder] ?? new THREE.Quaternion(), bones);
    if (ca[0] && cb[0]) note(pointing(ca[0], cb[0]));
    if (ca[1] && cb[1]) note(pointing(ca[1], cb[1]));
    if (ca[2] && cb[2]) note(angleBetween(ca[2], cb[2]));
  }
  for (const bones of LEG_CHAINS) {
    const ca = chain(a, new THREE.Quaternion(), bones);
    const cb = chain(b, new THREE.Quaternion(), bones);
    if (ca[0] && cb[0]) note(pointing(ca[0], cb[0]));
    if (ca[1] && cb[1]) note(pointing(ca[1], cb[1]));
    if (ca[2] && cb[2]) note(angleBetween(ca[2], cb[2]));
  }
  return worst;
}
