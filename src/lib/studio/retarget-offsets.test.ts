import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { retargetOffset } from "./retarget-offsets.ts";

const q = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
/** The target's world rotation for a source world rotation, as three's retarget composes it. */
const apply = (source: THREE.Quaternion, offset: THREE.Matrix4) => source.clone().multiply(new THREE.Quaternion().setFromRotationMatrix(offset));
const near = (a: THREE.Vector3, b: THREE.Vector3) => assert.ok(a.distanceTo(b) < 1e-6, `${a.toArray()} vs ${b.toArray()}`);

describe("retargetOffset", () => {
  it("is the identity between two rigs with identity rest frames", () => {
    assert.ok(retargetOffset(new THREE.Quaternion(), new THREE.Quaternion()).equals(new THREE.Matrix4()));
  });

  it("keeps the target at rest while the source is at rest, whatever the bone frames", () => {
    const sourceRest = q(0.3, 0.2, -0.4);
    const targetRest = q(1.9, -0.7, 0.5);
    const result = apply(sourceRest, retargetOffset(sourceRest, targetRest));
    assert.ok(result.angleTo(targetRest) < 1e-6);
  });

  it("moves the target's limb the way the source's moves, across different bone frames", () => {
    // Source bone along -X with an identity frame; target bone along its own +Y, same world direction.
    const sourceRest = new THREE.Quaternion();
    const targetRest = q(0, 0, Math.PI / 2);
    const axisInTarget = new THREE.Vector3(0, 1, 0);
    assert.ok(axisInTarget.clone().applyQuaternion(targetRest).distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-6);
    const offset = retargetOffset(sourceRest, targetRest);
    const lifted = q(0, 0, -Math.PI / 2); // the source arm swings from -X up to +Y
    near(axisInTarget.clone().applyQuaternion(apply(lifted, offset)), new THREE.Vector3(-1, 0, 0).applyQuaternion(lifted));
  });

  it("brings a lowered arm to the source's T", () => {
    const down = new THREE.Vector3(-1, -0.3, 0).normalize();
    const targetRest = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), down);
    const offset = retargetOffset(new THREE.Quaternion(), targetRest, { source: new THREE.Vector3(-1, 0, 0), target: down });
    const atRest = new THREE.Vector3(0, 1, 0).applyQuaternion(apply(new THREE.Quaternion(), offset));
    near(atRest, new THREE.Vector3(-1, 0, 0));
  });
});
