// The bones a pose turns (Mixamo names) and how a rig's own bone names are matched to them.
import * as THREE from "three";
import { canonicalBoneName } from "./bone-names.ts";

export const LOGICAL = [
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot",
  "LeftToeBase", "RightToeBase",
] as const;
export type Logical = (typeof LOGICAL)[number];
/** Every bone the poses turn, Mixamo names (the rig resolves its own name for each). */
export const LOGICAL_BONES: readonly Logical[] = LOGICAL;

/**
 * Resolve the rig's bone name for each logical Mixamo bone: exact Mixamo names first, then any
 * bone whose name reads as that joint (Meshy's `Spine01` / `neck`, DeepMotion's `l_arm_JNT`, …).
 */
export function resolveNames(model: THREE.Object3D): Partial<Record<Logical, string>> {
  const names: Partial<Record<Logical, string>> = {};
  for (const logical of LOGICAL) {
    for (const candidate of [`mixamorig${logical}`, `mixamorig:${logical}`, logical]) {
      if (model.getObjectByName(candidate)) {
        names[logical] = candidate;
        break;
      }
    }
  }
  model.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    const canonical = canonicalBoneName(o.name);
    if (canonical && (LOGICAL as readonly string[]).includes(canonical) && !names[canonical as Logical]) names[canonical as Logical] = o.name;
  });
  return names;
}
