/** Rigs for the solver's tests: the mannequin as it is, and one with everything awkward a real export has. */

import * as THREE from "three";
import { buildMannequin } from "./mannequin.ts";

type Joint = { name: string; parent: string | null; at: [number, number, number] };

/**
 * A rig with everything that made the Meshy avatar come out crooked: centimetres under an Armature
 * scaled 0.01, each bone's own Y along the bone, arms 17° below the horizontal and a little
 * forward, knees bent at rest, feet turned out, the trunk leaning back, a hand whose palm is
 * turned 30° from facing down, a spine numbered upside down (Spine2 lowest, as Meshy does) and an
 * elbow that "bends" upwards: a joint misplaced by the auto-rigger, not a hinge. Positions in metres.
 */
export function crookedRig(): { model: THREE.Object3D; palms: Record<"Left" | "Right", THREE.Vector3> } {
  const joints: Joint[] = [
    { name: "Hips", parent: null, at: [0, 0.95, 0] },
    { name: "Spine2", parent: "Hips", at: [0, 1.07, -0.01] },
    { name: "Spine1", parent: "Spine2", at: [0, 1.19, -0.02] },
    { name: "Spine", parent: "Spine1", at: [0, 1.31, -0.03] },
    { name: "Neck", parent: "Spine", at: [0, 1.46, -0.045] },
    { name: "Head", parent: "Neck", at: [0, 1.55, -0.05] },
  ];
  for (const [side, s] of [["Left", 1], ["Right", -1]] as const) {
    const arm = (len: number, down: number, fwd: number) => [s * len * Math.cos(down), -len * Math.sin(down), fwd] as const;
    const sh: [number, number, number] = [s * 0.18, 1.42, -0.04];
    const up = arm(0.28, THREE.MathUtils.degToRad(17), 0.0);
    const el: [number, number, number] = [sh[0] + up[0], sh[1] + up[1], sh[2] + up[2]];
    const fo = arm(0.26, 0, 0.03); // straight on, so the "bend" points up
    const wr: [number, number, number] = [el[0] + fo[0], el[1] + fo[1], el[2] + fo[2]];
    joints.push(
      { name: `${side}Arm`, parent: "Spine", at: sh },
      { name: `${side}ForeArm`, parent: `${side}Arm`, at: el },
      { name: `${side}Hand`, parent: `${side}ForeArm`, at: wr },
      { name: `${side}UpLeg`, parent: "Hips", at: [s * 0.09, 0.87, 0] },
      { name: `${side}Leg`, parent: `${side}UpLeg`, at: [s * 0.11, 0.49, 0.06] }, // knee forward: bent
      { name: `${side}Foot`, parent: `${side}Leg`, at: [s * 0.12, 0.09, -0.02] },
      { name: `${side}ToeBase`, parent: `${side}Foot`, at: [s * 0.12 + s * 0.035, 0.03, 0.13] }, // turned out
    );
  }
  const byName = new Map(joints.map((j) => [j.name, j]));
  const childOf = (name: string) => joints.find((j) => j.parent === name);
  const world = (j: Joint) => {
    const child = childOf(j.name);
    const to = child ? new THREE.Vector3(...child.at) : new THREE.Vector3(...j.at).sub(new THREE.Vector3(...byName.get(j.parent!)!.at)).add(new THREE.Vector3(...j.at));
    const axis = to.sub(new THREE.Vector3(...j.at)).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  };
  const root = new THREE.Group();
  const armature = new THREE.Group();
  armature.name = "Armature";
  armature.scale.setScalar(0.01);
  root.add(armature);
  const bones = new Map<string, THREE.Bone>();
  for (const j of joints) {
    const bone = new THREE.Bone();
    bone.name = j.name;
    const q = world(j);
    if (j.parent) {
      const parent = byName.get(j.parent)!;
      const pq = world(parent);
      bone.position.set(...j.at).sub(new THREE.Vector3(...parent.at)).applyQuaternion(pq.clone().invert()).multiplyScalar(100);
      bone.quaternion.copy(pq.clone().invert().multiply(q));
      bones.get(j.parent)!.add(bone);
    } else {
      bone.position.set(...j.at).multiplyScalar(100);
      bone.quaternion.copy(q);
      armature.add(bone);
    }
    bones.set(j.name, bone);
  }
  // Two flat hands: wide across, thin along the palm's normal, in the mesh's own (bind) space.
  const positions: number[] = [];
  const index: number[] = [];
  const weight: number[] = [];
  const skeletonBones = [...bones.values()];
  const palms = {} as Record<"Left" | "Right", THREE.Vector3>;
  for (const side of ["Left", "Right"] as const) {
    const wrist = new THREE.Vector3(...byName.get(`${side}Hand`)!.at);
    const fore = wrist.clone().sub(new THREE.Vector3(...byName.get(`${side}ForeArm`)!.at)).normalize();
    const down = new THREE.Vector3(0, -1, 0).addScaledVector(fore, fore.y).normalize();
    const palm = down.clone().applyAxisAngle(fore, THREE.MathUtils.degToRad(30));
    palms[side] = palm;
    const across = fore.clone().cross(palm).normalize();
    const bone = skeletonBones.indexOf(bones.get(`${side}Hand`)!);
    for (let i = 0; i < 40; i += 1) {
      const p = wrist.clone()
        .addScaledVector(fore, 0.02 + (i % 8) * 0.02)
        .addScaledVector(across, ((Math.floor(i / 8) % 5) - 2) * 0.02)
        .addScaledVector(palm, (i % 2 ? 1 : -1) * 0.006)
        .multiplyScalar(100);
      positions.push(p.x, p.y, p.z);
      index.push(bone, 0, 0, 0);
      weight.push(1, 0, 0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(index, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weight, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  armature.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(skeletonBones));
  return { model: root, palms };
}

export function mannequin(): THREE.Object3D {
  const root = new THREE.Group();
  root.add(buildMannequin(1.75));
  root.updateMatrixWorld(true);
  return root;
}
