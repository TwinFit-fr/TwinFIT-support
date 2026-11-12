// Rotation helpers the pose solvers share: degrees, the world axes, quaternion builders, arcs and frames.
import * as THREE from "three";

export const rad = THREE.MathUtils.degToRad;
const X = new THREE.Vector3(1, 0, 0);
export const Y = new THREE.Vector3(0, 1, 0);
export const Z = new THREE.Vector3(0, 0, 1);
export const qx = (deg: number) => new THREE.Quaternion().setFromAxisAngle(X, rad(deg));
export const qy = (deg: number) => new THREE.Quaternion().setFromAxisAngle(Y, rad(deg));
export const qz = (deg: number) => new THREE.Quaternion().setFromAxisAngle(Z, rad(deg));
export const mul = (...qs: THREE.Quaternion[]) => qs.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());

export const DOWN = new THREE.Vector3(0, -1, 0);

/** The part of v perpendicular to a unit axis. */
export function perpendicular(v: THREE.Vector3, axis: THREE.Vector3): THREE.Vector3 {
  return v.clone().addScaledVector(axis, -v.dot(axis));
}

/** Shortest rotation taking unit vector a onto unit vector b. */
export function arc(a: THREE.Vector3, b: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(a, b);
}

/** Rotation whose frame maps the rest pair (axis, normal) onto the wanted pair. */
export function frameDelta(axisRest: THREE.Vector3, normalRest: THREE.Vector3, axis: THREE.Vector3, normal: THREE.Vector3): THREE.Quaternion {
  const ortho = (ax: THREE.Vector3, n: THREE.Vector3) => n.clone().sub(ax.clone().multiplyScalar(n.dot(ax))).normalize();
  const nR = ortho(axisRest, normalRest);
  const nW = ortho(axis, normal);
  const mRest = new THREE.Matrix4().makeBasis(axisRest, nR, axisRest.clone().cross(nR));
  const mWant = new THREE.Matrix4().makeBasis(axis, nW, axis.clone().cross(nW));
  return new THREE.Quaternion().setFromRotationMatrix(mWant.multiply(mRest.transpose()));
}
