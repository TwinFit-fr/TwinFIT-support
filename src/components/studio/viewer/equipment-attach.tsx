// How equipment hangs on the avatar: a socket's offset and rotation, and a two-handed item kept between both hands.
"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AvatarSocket } from "@/lib/studio/types";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A two-handed item (barbell, plate): a world-space group kept, every frame, at the midpoint of
 * the two hand bones with its X axis running from one hand to the other. Not parented to a bone,
 * so the bones' scale does not reach the mesh.
 */
export function BilateralAttachment({ a, b, children }: { a: THREE.Object3D; b: THREE.Object3D; children: React.ReactNode }) {
  const group = useMemo(() => new THREE.Group(), []);
  const pa = useMemo(() => new THREE.Vector3(), []);
  const pb = useMemo(() => new THREE.Vector3(), []);
  const x = useMemo(() => new THREE.Vector3(), []);
  const y = useMemo(() => new THREE.Vector3(), []);
  const z = useMemo(() => new THREE.Vector3(), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    a.getWorldPosition(pa);
    b.getWorldPosition(pb);
    group.position.addVectors(pa, pb).multiplyScalar(0.5);
    x.subVectors(pa, pb);
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
    x.normalize();
    z.crossVectors(x, UP);
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1);
    z.normalize();
    y.crossVectors(z, x).normalize();
    m.makeBasis(x, y, z);
    group.quaternion.setFromRotationMatrix(m);
  });
  return <primitive object={group}>{children}</primitive>;
}

export function socketTransform(socket: AvatarSocket | undefined) {
  const offset = new THREE.Vector3(...(socket?.offset ?? [0, 0, 0]));
  const quaternion = new THREE.Quaternion();
  const r = socket?.rotation;
  if (r?.length === 4) quaternion.set(r[0], r[1], r[2], r[3]);
  else if (r?.length === 3)
    quaternion.setFromEuler(new THREE.Euler(...(r.map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number])));
  return { offset, quaternion };
}
