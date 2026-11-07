import * as THREE from "three";

/**
 * The avatar's rest pose, captured when the model is laid out, before any animation touches the
 * bones. Going back to it is `restoreRestPose`, never `skeleton.pose()`: that one writes the bind
 * matrix straight into a root bone whose parent is not a bone, so a rig under a scaled Armature
 * (every Blender export, Meshy's included: scale 0.01) gets the scale twice and shrinks 100 times.
 */
export type RestPose = Map<
  string,
  {
    local: THREE.Quaternion;
    position: THREE.Vector3;
    scale: THREE.Vector3;
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
      scale: o.scale.clone(),
      world: o.getWorldQuaternion(new THREE.Quaternion()),
      worldPosition: o.getWorldPosition(new THREE.Vector3()),
      parentWorldScale: o.parent?.getWorldScale(new THREE.Vector3()).x || 1,
      parent: o.parent?.name ?? null,
    });
  });
  return rest;
}

/** Every bone back to its captured local transform, world matrices up to date. */
export function restoreRestPose(model: THREE.Object3D, rest: RestPose): void {
  model.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    const r = rest.get(o.name);
    if (!r) return;
    o.position.copy(r.position);
    o.quaternion.copy(r.local);
    o.scale.copy(r.scale);
  });
  model.updateMatrixWorld(true);
}
