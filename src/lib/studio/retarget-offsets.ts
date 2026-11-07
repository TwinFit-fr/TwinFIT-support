import * as THREE from "three";

/**
 * The rotation that carries a source bone's motion onto a target bone whose local axes have
 * nothing to do with it. Rigs do not share bone frames: a Mixamo-style rig has identity rest
 * frames, a Blender rig points each bone's Y along the bone, so the world rotation of a bone is
 * meaningless across rigs. What transfers is the motion away from rest:
 *
 *   target(t) = source(t) · source_rest⁻¹ · align · target_rest
 *
 * `align` turns the target's rest direction of a limb segment onto the source's, so an avatar
 * resting with its arms lowered still reaches a T when the source holds one. Without directions
 * (spine, hips) the two rest poses are taken as equivalent.
 *
 * Returned as the right-hand factor three's retarget multiplies (its `localOffsets`).
 */
export function retargetOffset(
  sourceRest: THREE.Quaternion,
  targetRest: THREE.Quaternion,
  direction?: { source: THREE.Vector3; target: THREE.Vector3 } | null,
): THREE.Matrix4 {
  const q = sourceRest.clone().invert();
  if (direction && direction.source.lengthSq() > 1e-12 && direction.target.lengthSq() > 1e-12) {
    q.multiply(new THREE.Quaternion().setFromUnitVectors(direction.target.clone().normalize(), direction.source.clone().normalize()));
  }
  return new THREE.Matrix4().makeRotationFromQuaternion(q.multiply(targetRest));
}
