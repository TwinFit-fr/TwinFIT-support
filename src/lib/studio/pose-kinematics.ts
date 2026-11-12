// The rig of a loaded model, built and calibrated once per rest pose, with bone-local rotations and forward kinematics on it.
import * as THREE from "three";
import { LOGICAL, resolveNames, type Logical } from "./pose-bones.ts";
import { calibrate } from "./pose-calibrate.ts";
import type { RestPose } from "./rest-pose.ts";
import type { Rig, WorldTransform } from "./pose-types.ts";

/** Bone-local rotation for a rotation away from the anatomical position, relative to the parent. */
export function localFor(rig: Rig, name: string, delta: THREE.Quaternion): THREE.Quaternion {
  const r = rig.rest.get(name)!;
  const pw = rig.parentWorld.get(name) ?? new THREE.Quaternion();
  const own = rig.correction.get(name);
  const inherited = rig.parentCorrection.get(name);
  // world = parent's rotation · delta · correction · rest, and the parent's world already holds its own correction.
  const q = pw.clone().invert();
  if (inherited) q.multiply(inherited.clone().invert());
  q.multiply(delta);
  if (own) q.multiply(own);
  return q.multiply(pw).multiply(r.local);
}

const rigs = new WeakMap<RestPose, Rig>();

/** The rig of a rest pose, calibrated once: the rest pose object changes when the model is laid out again. */
export function buildRig(model: THREE.Object3D, rest: RestPose): Rig {
  const cached = rigs.get(rest);
  if (cached) return cached;
  const names = resolveNames(model);
  const parentWorld = new Map<string, THREE.Quaternion>();
  for (const [name, r] of rest) {
    const parent = r.parent ? rest.get(r.parent) : undefined;
    if (parent) parentWorld.set(name, parent.world.clone());
    else {
      const node = model.getObjectByName(name)?.parent;
      parentWorld.set(name, node ? node.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion());
    }
  }
  const correction = calibrate(model, rest, names);
  const parentCorrection = new Map<string, THREE.Quaternion>();
  const anatomical = new Map<string, THREE.Quaternion>();
  for (const [name, r] of rest) {
    for (let parent = r.parent; parent; parent = rest.get(parent)?.parent ?? null) {
      const q = correction.get(parent);
      if (q) {
        parentCorrection.set(name, q);
        break;
      }
    }
    anatomical.set(name, (correction.get(name) ?? new THREE.Quaternion()).clone().multiply(r.world));
  }
  const hipsName = names.Hips;
  const hipsRestY = (hipsName ? rest.get(hipsName)?.worldPosition.y : undefined) ?? 0.95;
  const y = (logical: Logical, fallback: number) => (names[logical] ? (rest.get(names[logical]!)?.worldPosition.y ?? fallback) : fallback);
  const rig: Rig = {
    names,
    rest,
    parentWorld,
    hipsRestY,
    correction,
    parentCorrection,
    anatomical,
    feet: [],
    planted: new WeakMap(),
    spine: (["Spine", "Spine1", "Spine2"] as const).filter((l) => names[l] && rest.has(names[l]!)).sort((a, b) => y(a, 0) - y(b, 0)),
    arms: [],
    heights: { knee: y("LeftLeg", hipsRestY * 0.55), hip: y("LeftUpLeg", hipsRestY), shoulder: y("LeftArm", hipsRestY * 1.5) },
  };
  for (const [side, prefix] of [["left", "Left"], ["right", "Right"]] as const) {
    const [upper, fore, hand] = [names[`${prefix}Arm`], names[`${prefix}ForeArm`], names[`${prefix}Hand`]];
    if (upper && fore && hand) rig.arms.push({ side, upper, fore, hand });
  }

  // Where the feet sit in the anatomical position, with the pelvis where it rests.
  const fk = forwardKinematics(rig, locals(rig, {}), hipsName ? rest.get(hipsName)!.position : new THREE.Vector3());
  for (const [side, prefix] of [["left", "Left"], ["right", "Right"]] as const) {
    const name = names[`${prefix}Foot`];
    const thigh = names[`${prefix}UpLeg`];
    const shank = names[`${prefix}Leg`];
    const toe = names[`${prefix}ToeBase`] ?? null;
    const home = name ? fk.get(name)?.pos : undefined;
    if (!name || !thigh || !shank || !home) continue;
    // Down the foot's bones to the last one: some rigs end in a toe tip below the toe.
    let tip = toe ?? name;
    for (let next = [...rest].find(([, r]) => r.parent === tip); next; next = [...rest].find(([, r]) => r.parent === tip)) tip = next[0];
    rig.feet.push({
      side,
      logical: `${prefix}Foot`,
      name,
      thigh,
      shank,
      toe,
      tip,
      ankleRestY: rest.get(name)!.worldPosition.y,
      toeRestY: toe ? rest.get(toe)!.worldPosition.y : 0,
      tipRestY: rest.get(tip)!.worldPosition.y,
      home: home.clone(),
    });
  }
  rigs.set(rest, rig);
  return rig;
}

/** Bone-local rotations of every logical bone the rig has, for these deltas (identity where absent). */
export function locals(rig: Rig, deltas: Partial<Record<Logical, THREE.Quaternion>>): Map<string, THREE.Quaternion> {
  const local = new Map<string, THREE.Quaternion>();
  for (const logical of LOGICAL) {
    const name = rig.names[logical];
    if (name && rig.rest.has(name)) local.set(name, localFor(rig, name, deltas[logical] ?? new THREE.Quaternion()));
  }
  return local;
}

/** World transform of every bone (or only of `only` and their parents) for a set of local quaternions (rest positions, hips moved). */
export function forwardKinematics(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3, only?: string[]): Map<string, WorldTransform> {
  const out = new Map<string, WorldTransform>();
  const hipsName = rig.names.Hips;
  const worldOf = (name: string): WorldTransform | null => {
    const cached = out.get(name);
    if (cached) return cached;
    const r = rig.rest.get(name);
    if (!r) return null;
    const qLocal = local.get(name) ?? r.local;
    const pLocal = (name === hipsName ? hipsPosition : r.position).clone().multiplyScalar(r.parentWorldScale);
    let parent: WorldTransform | null = r.parent ? worldOf(r.parent) : null;
    if (!parent) {
      // The bone hangs from a non-bone node (Armature, model root): recover that node's world
      // transform from the bone's rest world position.
      const pq = rig.parentWorld.get(name) ?? new THREE.Quaternion();
      const pp = r.worldPosition.clone().sub(r.position.clone().multiplyScalar(r.parentWorldScale).applyQuaternion(pq));
      parent = { pos: pp, quat: pq };
    }
    const t = { pos: parent.pos.clone().add(pLocal.applyQuaternion(parent.quat)), quat: parent.quat.clone().multiply(qLocal) };
    out.set(name, t);
    return t;
  };
  for (const name of only ?? rig.rest.keys()) worldOf(name);
  return out;
}
