import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { captureRestPose, restoreRestPose } from "./rest-pose.ts";

/** A rig as Blender exports it: bones in centimetres under an Armature scaled 0.01, bind matrices in metres. */
function armatureRig() {
  const root = new THREE.Group();
  const armature = new THREE.Group();
  armature.name = "Armature";
  armature.scale.setScalar(0.01);
  const hips = new THREE.Bone();
  hips.name = "Hips";
  hips.position.set(0, 95, 0);
  const spine = new THREE.Bone();
  spine.name = "Spine";
  spine.position.set(0, 12, 0);
  hips.add(spine);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  armature.add(mesh, hips);
  root.add(armature);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([hips, spine]));
  return { root, mesh, hips, spine };
}

const worldY = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3()).y;
const worldScale = (o: THREE.Object3D) => o.getWorldScale(new THREE.Vector3()).x;

describe("restoreRestPose", () => {
  it("puts a posed rig back without touching its size", () => {
    const { root, hips, spine } = armatureRig();
    const rest = captureRestPose(root);
    hips.position.y = 40;
    hips.quaternion.setFromEuler(new THREE.Euler(1, 0, 0));
    hips.scale.setScalar(3);
    restoreRestPose(root, rest);
    assert.ok(Math.abs(worldY(hips) - 0.95) < 1e-6);
    assert.ok(Math.abs(worldY(spine) - 1.07) < 1e-6);
    assert.ok(Math.abs(worldScale(hips) - 0.01) < 1e-9);
  });

  it("is why skeleton.pose() is not used: on this rig it applies the Armature scale twice", () => {
    const { root, mesh, hips } = armatureRig();
    mesh.skeleton.pose();
    root.updateMatrixWorld(true);
    assert.ok(worldScale(hips) < 0.001, "three puts the bind matrix in the root bone's local transform");
  });
});
