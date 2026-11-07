import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AvatarSocket } from "./types";

/**
 * A procedural mannequin with the Mixamo skeleton (bone names `mixamorig<Name>`, T-pose rest,
 * +Z forward, left side at +X, metres), skinned rigidly with one capsule per limb segment.
 * Built in the browser and exported to GLB, so the Studio gets a rig-correct neutral avatar with
 * no download, no licence and no Blender. Any animation authored for Mixamo drives it.
 */

type BoneSpec = {
  name: string;
  parent: string | null;
  /** Position relative to the parent bone (metres). */
  offset: [number, number, number];
};

/** Proportions of a 1.75 m body; scaled by `heightM / 1.75`. */
const BONES: BoneSpec[] = [
  { name: "Hips", parent: null, offset: [0, 0.98, 0] },
  { name: "Spine", parent: "Hips", offset: [0, 0.09, 0] },
  { name: "Spine1", parent: "Spine", offset: [0, 0.11, 0] },
  { name: "Spine2", parent: "Spine1", offset: [0, 0.12, 0] },
  { name: "Neck", parent: "Spine2", offset: [0, 0.13, 0] },
  { name: "Head", parent: "Neck", offset: [0, 0.09, 0.01] },
  { name: "HeadTop_End", parent: "Head", offset: [0, 0.22, 0] },

  { name: "LeftShoulder", parent: "Spine2", offset: [0.06, 0.1, 0] },
  { name: "LeftArm", parent: "LeftShoulder", offset: [0.13, 0, 0] },
  { name: "LeftForeArm", parent: "LeftArm", offset: [0.28, 0, 0] },
  { name: "LeftHand", parent: "LeftForeArm", offset: [0.26, 0, 0] },
  { name: "LeftHandMiddle1", parent: "LeftHand", offset: [0.1, 0, 0] },
  { name: "LeftHandMiddle1_End", parent: "LeftHandMiddle1", offset: [0.08, 0, 0] },

  { name: "RightShoulder", parent: "Spine2", offset: [-0.06, 0.1, 0] },
  { name: "RightArm", parent: "RightShoulder", offset: [-0.13, 0, 0] },
  { name: "RightForeArm", parent: "RightArm", offset: [-0.28, 0, 0] },
  { name: "RightHand", parent: "RightForeArm", offset: [-0.26, 0, 0] },
  { name: "RightHandMiddle1", parent: "RightHand", offset: [-0.1, 0, 0] },
  { name: "RightHandMiddle1_End", parent: "RightHandMiddle1", offset: [-0.08, 0, 0] },

  { name: "LeftUpLeg", parent: "Hips", offset: [0.09, -0.05, 0] },
  { name: "LeftLeg", parent: "LeftUpLeg", offset: [0, -0.43, 0] },
  { name: "LeftFoot", parent: "LeftLeg", offset: [0, -0.42, 0] },
  { name: "LeftToeBase", parent: "LeftFoot", offset: [0, -0.07, 0.13] },
  { name: "LeftToe_End", parent: "LeftToeBase", offset: [0, 0, 0.07] },

  { name: "RightUpLeg", parent: "Hips", offset: [-0.09, -0.05, 0] },
  { name: "RightLeg", parent: "RightUpLeg", offset: [0, -0.43, 0] },
  { name: "RightFoot", parent: "RightLeg", offset: [0, -0.42, 0] },
  { name: "RightToeBase", parent: "RightFoot", offset: [0, -0.07, 0.13] },
  { name: "RightToe_End", parent: "RightToeBase", offset: [0, 0, 0.07] },
];

/** Limb segments: a capsule from a bone to its child, skinned to the first bone. */
const SEGMENTS: { from: string; to: string; radius: number }[] = [
  { from: "Hips", to: "Spine1", radius: 0.14 },
  { from: "Spine1", to: "Neck", radius: 0.13 },
  { from: "Neck", to: "Head", radius: 0.05 },
  { from: "LeftShoulder", to: "LeftArm", radius: 0.06 },
  { from: "LeftArm", to: "LeftForeArm", radius: 0.05 },
  { from: "LeftForeArm", to: "LeftHand", radius: 0.042 },
  { from: "LeftHand", to: "LeftHandMiddle1_End", radius: 0.035 },
  { from: "RightShoulder", to: "RightArm", radius: 0.06 },
  { from: "RightArm", to: "RightForeArm", radius: 0.05 },
  { from: "RightForeArm", to: "RightHand", radius: 0.042 },
  { from: "RightHand", to: "RightHandMiddle1_End", radius: 0.035 },
  { from: "LeftUpLeg", to: "LeftLeg", radius: 0.08 },
  { from: "LeftLeg", to: "LeftFoot", radius: 0.06 },
  { from: "LeftFoot", to: "LeftToe_End", radius: 0.045 },
  { from: "RightUpLeg", to: "RightLeg", radius: 0.08 },
  { from: "RightLeg", to: "RightFoot", radius: 0.06 },
  { from: "RightFoot", to: "RightToe_End", radius: 0.045 },
];

const HEAD_RADIUS = 0.11;
const BASE_HEIGHT = 1.75;
export const MANNEQUIN_CODE = "MANNEQUIN_MIXAMO";

export function mannequinSockets(heightM: number): AvatarSocket[] {
  const k = heightM / BASE_HEIGHT;
  return [
    { id: "hand_l", bone: "mixamorigLeftHand", offset: [0.05 * k, 0, 0] },
    { id: "hand_r", bone: "mixamorigRightHand", offset: [-0.05 * k, 0, 0] },
    { id: "back", bone: "mixamorigSpine2", offset: [0, 0, -0.16 * k] },
    { id: "feet", bone: "mixamorigHips", offset: [0, -0.98 * k, 0] },
  ];
}

function withSkin(geometry: THREE.BufferGeometry, boneIndex: number): THREE.BufferGeometry {
  const count = geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    indices[i * 4] = boneIndex;
    weights[i * 4] = 1;
  }
  geometry.setAttribute("skinIndex", new THREE.BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(weights, 4));
  return geometry;
}

/** Builds the skinned mannequin; the caller owns disposal. */
export function buildMannequin(heightM = BASE_HEIGHT): THREE.SkinnedMesh {
  const k = heightM / BASE_HEIGHT;
  const bones: THREE.Bone[] = [];
  const byName = new Map<string, THREE.Bone>();
  for (const spec of BONES) {
    const bone = new THREE.Bone();
    bone.name = `mixamorig${spec.name}`;
    bone.position.set(spec.offset[0] * k, spec.offset[1] * k, spec.offset[2] * k);
    if (spec.parent) byName.get(spec.parent)!.add(bone);
    bones.push(bone);
    byName.set(spec.name, bone);
  }
  const root = bones[0];
  root.updateMatrixWorld(true);

  const worldOf = (name: string) => byName.get(name)!.getWorldPosition(new THREE.Vector3());
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (const seg of SEGMENTS) {
    const a = worldOf(seg.from);
    const b = worldOf(seg.to);
    const dir = b.clone().sub(a);
    const length = Math.max(dir.length() - seg.radius * 0.6 * k, 0.01);
    const radius = seg.radius * k;
    const geometry = new THREE.CapsuleGeometry(radius, length, 6, 14);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    geometry.applyQuaternion(quaternion);
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(withSkin(geometry, bones.findIndex((bone) => bone.name === `mixamorig${seg.from}`)));
  }
  const head = worldOf("Head");
  const headGeometry = new THREE.SphereGeometry(HEAD_RADIUS * k, 20, 16);
  headGeometry.translate(head.x, head.y + HEAD_RADIUS * k * 0.9, head.z);
  parts.push(withSkin(headGeometry, bones.findIndex((bone) => bone.name === "mixamorigHead")));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("Could not merge the mannequin geometry");
  merged.computeVertexNormals();
  for (const part of parts) part.dispose();

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#8d9ab0"),
    roughness: 0.55,
    metalness: 0.05,
    name: "MannequinMatte",
  });
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.name = "Mannequin";
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The mannequin as a .glb file ready to upload. */
export async function exportMannequinGlb(heightM = BASE_HEIGHT): Promise<File> {
  const mesh = buildMannequin(heightM);
  const scene = new THREE.Scene();
  scene.name = "TwinFITMannequin";
  scene.add(mesh);
  try {
    const result = await new GLTFExporter().parseAsync(scene, { binary: true });
    if (!(result instanceof ArrayBuffer)) throw new Error("The exporter did not return a binary glTF");
    return new File([result], `${MANNEQUIN_CODE.toLowerCase()}.glb`, { type: "model/gltf-binary" });
  } finally {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
}
