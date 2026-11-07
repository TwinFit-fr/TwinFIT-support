import * as THREE from "three";
import {
  HIPS_HEIGHT_BY_ORIENTATION,
  clampToLimit,
  getPoseValue,
  lerpPose,
  palmFacing,
  setPoseValue,
  swingAxis,
  upgradePoseClip,
  type AnchorId,
  type ArmAngles,
  type HeightRef,
  type LegAngles,
  type PoseAngles,
  type PoseClipJson,
} from "./anatomy.ts";
import { canonicalBoneName } from "./bone-names.ts";
import { captureRestPose, restoreRestPose, type RestPose } from "./rest-pose.ts";
import type { AvatarSocket } from "./types";

export { captureRestPose, restoreRestPose, type RestPose };

/**
 * Solves a pose-angles clip on a loaded rig. Each rig is first calibrated to the anatomical
 * position, whatever its rest pose (T, A, bent limbs, bones with any axes): one correction per
 * bone (`calibrate`). A pose is then a rotation of each bone away from that position, in the
 * character frame, so all zeros is the anatomical position on every avatar. Standing, the pelvis
 * is placed from the legs and the soles stay on the floor. Every frame of a clip is solved, not
 * just its keyframes, so contact holds between them. Works for any Mixamo-named skeleton
 * (`mixamorigHips`, `mixamorig:Hips` or plain `Hips`) whatever its units or proportions.
 */

const LOGICAL = [
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot",
  "LeftToeBase", "RightToeBase",
] as const;
type Logical = (typeof LOGICAL)[number];

/**
 * Resolve the rig's bone name for each logical Mixamo bone: exact Mixamo names first, then any
 * bone whose name reads as that joint (Meshy's `Spine01` / `neck`, DeepMotion's `l_arm_JNT`, …).
 */
function resolveNames(model: THREE.Object3D): Partial<Record<Logical, string>> {
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

const rad = THREE.MathUtils.degToRad;
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const qx = (deg: number) => new THREE.Quaternion().setFromAxisAngle(X, rad(deg));
const qy = (deg: number) => new THREE.Quaternion().setFromAxisAngle(Y, rad(deg));
const qz = (deg: number) => new THREE.Quaternion().setFromAxisAngle(Z, rad(deg));
const mul = (...qs: THREE.Quaternion[]) => qs.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());

/** How much of raising the arm the clavicle takes: about 6° at 120° of elevation (Ludewig 2009). */
const CLAVICLE_RISE = 0.05;

/**
 * Rotation of every bone away from the anatomical position, in the character frame, each one
 * relative to its parent (s = +1 left side, -1 right side). All zeros gives identity everywhere.
 */
function characterDeltas(p: PoseAngles, rig: Rig): Partial<Record<Logical, THREE.Quaternion>> {
  const arm = (a: ArmAngles, s: 1 | -1, shoulder: Logical) => {
    const axis = new THREE.Vector3(...swingAxis(a.shoulder_plane, s));
    // Plane and elevation are one swing of the arm, then the rotation about it: the ISB sequence
    // without its singularity at the anatomical position, where the plane simply stops mattering.
    const humerus = mul(new THREE.Quaternion().setFromAxisAngle(axis, rad(a.shoulder_elevation)), qy(s * a.shoulder_rotation));
    const girdle = mul(qz(s * (a.scapula_elevation + a.shoulder_elevation * CLAVICLE_RISE)), qy(-s * a.scapula_protraction));
    return {
      girdle,
      // The clavicle carries the arm, and the humerus keeps its direction against the thorax.
      upper: rig.names[shoulder] ? girdle.clone().invert().multiply(humerus) : humerus,
      fore: mul(qx(-a.elbow_flexion), qy(-s * a.forearm_pronation)),
      hand: mul(qx(-a.wrist_flexion), qz(s * a.wrist_deviation)),
    };
  };
  // Flexion first, abduction on the axis it leaves, rotation last (the ISB order for the hip):
  // abducting a flexed thigh moves the knee out instead of turning the shank.
  const leg = (l: LegAngles, s: 1 | -1) => ({
    upper: mul(qx(-l.hip_flexion), qz(s * l.hip_abduction), qy(s * l.hip_rotation)),
    lower: qx(l.knee_flexion),
    foot: mul(qx(-l.ankle_dorsiflexion), qz(-s * l.ankle_inversion)),
  });
  const la = arm(p.left_arm, 1, "LeftShoulder");
  const ra = arm(p.right_arm, -1, "RightShoulder");
  const ll = leg(p.left_leg, 1);
  const rl = leg(p.right_leg, -1);
  const segment = (a: PoseAngles["lumbar"], share: number) => mul(qx(a.flexion * share), qz(-a.lateral * share), qy(a.twist * share));
  const deltas: Partial<Record<Logical, THREE.Quaternion>> = {
    Hips: mul(qy(p.hips.yaw), qx(p.hips.pitch), qz(p.hips.roll)),
    Neck: mul(qx(p.head.pitch * 0.4), qy(p.head.yaw * 0.4), qz(-p.head.lateral * 0.4)),
    Head: mul(qx(p.head.pitch * 0.6), qy(p.head.yaw * 0.6), qz(-p.head.lateral * 0.6)),
    LeftShoulder: la.girdle,
    LeftArm: la.upper,
    LeftForeArm: la.fore,
    LeftHand: la.hand,
    RightShoulder: ra.girdle,
    RightArm: ra.upper,
    RightForeArm: ra.fore,
    RightHand: ra.hand,
    LeftUpLeg: ll.upper,
    LeftLeg: ll.lower,
    LeftFoot: ll.foot,
    RightUpLeg: rl.upper,
    RightLeg: rl.lower,
    RightFoot: rl.foot,
  };
  // The lowest spine bone is the lumbar spine, the rest share the thoracic: by height, not by
  // name (Meshy numbers them the other way up). A short spine does all of it in what it has.
  const spine = rig.spine;
  if (spine.length === 1) deltas[spine[0]] = mul(segment(p.lumbar, 1), segment(p.thoracic, 1));
  else spine.forEach((logical, i) => (deltas[logical] = i === 0 ? segment(p.lumbar, 1) : segment(p.thoracic, 1 / (spine.length - 1))));
  return deltas;
}

type Solved = {
  local: Map<string, THREE.Quaternion>;
  hipsPosition: THREE.Vector3;
  /** Where the pelvis went from its rest position, world metres. */
  hipsOffset: THREE.Vector3;
  /** How much each foot (rig.feet order) carries the body, 0 to 1; empty when not standing. */
  support: number[];
};

/** What a clip needs beyond the angles: whether the arms reach a two-handed implement, and how. */
export type SolveContext = {
  twoHanded: boolean;
  grip: string | null;
  sockets: AvatarSocket[];
  /** The clip's first pose: where the feet are planted for the poses that follow. */
  stance?: PoseAngles;
};

/** A foot further than this from where the first pose planted it has stepped: it is not held there. */
const STEP_M = 0.45;

/** A foot of the rig and where it belongs: its floor heights at rest, its place in the anatomical position. */
type RigFoot = {
  side: "left" | "right";
  logical: "LeftFoot" | "RightFoot";
  name: string;
  thigh: string;
  shank: string;
  toe: string | null;
  /** The furthest bone of the foot, for what must stay above the floor. */
  tip: string;
  ankleRestY: number;
  toeRestY: number;
  tipRestY: number;
  home: THREE.Vector3;
};

type Rig = {
  names: Partial<Record<Logical, string>>;
  rest: RestPose;
  /** Rest world rotation of each bone's parent (identity for a bone under a non-bone node). */
  parentWorld: Map<string, THREE.Quaternion>;
  hipsRestY: number;
  /** World rotation taking each bone from rest to the anatomical position. */
  correction: Map<string, THREE.Quaternion>;
  /** The correction of each bone's nearest calibrated ancestor (what its parent already turned). */
  parentCorrection: Map<string, THREE.Quaternion>;
  /** World rotation of each calibrated bone in the anatomical position. */
  anatomical: Map<string, THREE.Quaternion>;
  feet: RigFoot[];
  /** Where each first pose leaves the body (see plantedBody). */
  planted: WeakMap<PoseAngles, Planted>;
  /** Spine bones from the lowest up. */
  spine: Logical[];
  /** Arm chains, left and right: what `plant_hands` holds. */
  arms: { side: "left" | "right"; upper: string; fore: string; hand: string }[];
  /** Heights of the rig standing at rest, for what depends on its proportions. */
  heights: { knee: number; hip: number; shoulder: number };
};

type Planted = { feet: (THREE.Vector3 | null)[]; toes: (THREE.Vector3 | null)[]; knees: (THREE.Vector3 | null)[]; hands: (THREE.Vector3 | null)[] };

const KNEE_ABOVE_FLOOR = 0.06;

const DOWN = new THREE.Vector3(0, -1, 0);

/** The part of v perpendicular to a unit axis. */
function perpendicular(v: THREE.Vector3, axis: THREE.Vector3): THREE.Vector3 {
  return v.clone().addScaledVector(axis, -v.dot(axis));
}

/**
 * Which way is front on a limb at rest. A bent elbow or knee says it (the joint hinges in that
 * plane), when the bend is large enough to be a bend and lies close to the avatar's front; a
 * straight limb takes that front. Closeness matters: an auto-rigger places joints inside the mesh
 * and its elbows "bend" 18° upwards with the arm straight, which is no hinge at all.
 */
function limbFront(axis: THREE.Vector3, next: THREE.Vector3, bendsForward: boolean): THREE.Vector3 {
  const front = perpendicular(Z, axis).normalize();
  const bend = perpendicular(next, axis).multiplyScalar(bendsForward ? 1 : -1);
  if (axis.angleTo(next) < rad(8) || bend.lengthSq() < 1e-8) return front;
  bend.normalize();
  return bend.dot(front) > 0.85 ? bend : front;
}

/**
 * The way the palm faces at rest, from the flat shape of the hand's own vertices: the thin axis
 * across the hand, signed by `hint`. Null when the mesh does not say (no vertices on the hand, a
 * mitten with no flat side).
 */
function restPalm(model: THREE.Object3D, hand: string, axis: THREE.Vector3, hint: THREE.Vector3): THREE.Vector3 | null {
  const e1 = perpendicular(Math.abs(axis.y) < 0.9 ? Y : Z, axis).normalize();
  const e2 = axis.clone().cross(e1);
  const points: [number, number][] = [];
  const v = new THREE.Vector3();
  model.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const index = mesh.skeleton.bones.findIndex((b) => b.name === hand);
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    if (index < 0 || !position || !skinIndex || !skinWeight) return;
    const turn = mesh.getWorldQuaternion(new THREE.Quaternion());
    for (let i = 0; i < position.count; i += 1) {
      for (let k = 0; k < 4; k += 1) {
        if (skinIndex.getComponent(i, k) === index && skinWeight.getComponent(i, k) > 0.5) {
          v.fromBufferAttribute(position, i).applyQuaternion(turn);
          points.push([v.dot(e1), v.dot(e2)]);
          break;
        }
      }
    }
  });
  if (points.length < 12) return null;
  const [mx, my] = points.reduce(([a, b], [x, y]) => [a + x / points.length, b + y / points.length], [0, 0]);
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of points) {
    xx += (x - mx) ** 2;
    yy += (y - my) ** 2;
    xy += (x - mx) * (y - my);
  }
  const half = (xx + yy) / 2;
  const spread = Math.hypot((xx - yy) / 2, xy);
  if (half <= 0 || Math.sqrt(Math.max(half - spread, 0) / (half + spread)) > 0.75) return null;
  const wide = Math.atan2(2 * xy, xx - yy) / 2;
  const thin = e1.clone().multiplyScalar(-Math.sin(wide)).addScaledVector(e2, Math.cos(wide));
  return thin.dot(hint) < 0 ? thin.negate() : thin;
}

/**
 * The correction of each bone, from the rig's own joints: limb segments straight down, the front
 * of the arm and leg forward, palms forward, feet parallel, the spine upright. Measured from
 * directions and frames, never by subtracting angles: rotations do not commute, and a rig resting
 * with lowered arms and bent knees would come out crooked.
 */
function calibrate(model: THREE.Object3D, rest: RestPose, names: Partial<Record<Logical, string>>): Map<string, THREE.Quaternion> {
  const correction = new Map<string, THREE.Quaternion>();
  const at = (logical: Logical) => (names[logical] ? rest.get(names[logical]!)?.worldPosition : undefined);
  const set = (logical: Logical, q: THREE.Quaternion) => {
    if (names[logical]) correction.set(names[logical]!, q);
  };
  const direction = (a: THREE.Vector3, b: THREE.Vector3) => b.clone().sub(a).normalize();

  for (const side of ["Left", "Right"] as const) {
    const shoulder = at(`${side}Arm`), elbow = at(`${side}ForeArm`), wrist = at(`${side}Hand`);
    if (shoulder && elbow && wrist) {
      const upper = direction(shoulder, elbow);
      const fore = direction(elbow, wrist);
      set(`${side}Arm`, frameDelta(upper, limbFront(upper, fore, true), DOWN, Z));
      // Rigs rest with the palms down (T, A); a rig resting with the arms down has them forward.
      const down = perpendicular(DOWN, fore);
      const palmHint = (down.lengthSq() > 0.1 ? down : perpendicular(Z, fore)).normalize();
      // The nudge forward only settles the sign of a palm the mesh shows edge-on to the floor.
      const palm = restPalm(model, names[`${side}Hand`]!, fore, palmHint.clone().addScaledVector(Z, 0.2)) ?? palmHint;
      const forearm = frameDelta(fore, palm, DOWN, Z);
      set(`${side}ForeArm`, forearm);
      set(`${side}Hand`, forearm.clone());
    }
    const hip = at(`${side}UpLeg`), knee = at(`${side}Leg`), ankle = at(`${side}Foot`);
    if (hip && knee && ankle) {
      const thigh = direction(hip, knee);
      const shank = direction(knee, ankle);
      const front = limbFront(thigh, shank, false);
      set(`${side}UpLeg`, frameDelta(thigh, front, DOWN, Z));
      set(`${side}Leg`, frameDelta(shank, perpendicular(front, shank).normalize(), DOWN, Z));
      // The sole already lies on the floor at rest: only the heading of the foot changes.
      const toe = at(`${side}ToeBase`);
      const heading = perpendicular(toe ? toe.clone().sub(ankle) : front, Y);
      const foot = heading.lengthSq() > 1e-8 ? arc(heading.normalize(), Z) : new THREE.Quaternion();
      set(`${side}Foot`, foot);
      set(`${side}ToeBase`, foot.clone());
    }
  }
  // The spine turns about its lowest bone, so that the neck ends up right above the pelvis. By
  // height, not by name: Meshy numbers its spine the other way up (Spine02 is the lowest).
  const pelvis = at("Hips");
  const spine = (["Spine", "Spine1", "Spine2"] as const).flatMap((l) => at(l) ?? []).sort((a, b) => a.y - b.y);
  const base = spine[0] ?? pelvis;
  const top = at("Neck") ?? spine[spine.length - 1];
  if (pelvis && base && top && base !== top) {
    const upright = arc(direction(base, top), direction(base, new THREE.Vector3(pelvis.x, top.y, pelvis.z)));
    for (const logical of ["Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder"] as const) set(logical, upright.clone());
  }
  return correction;
}

/** Bone-local rotation for a rotation away from the anatomical position, relative to the parent. */
function localFor(rig: Rig, name: string, delta: THREE.Quaternion): THREE.Quaternion {
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
function buildRig(model: THREE.Object3D, rest: RestPose): Rig {
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
function locals(rig: Rig, deltas: Partial<Record<Logical, THREE.Quaternion>>): Map<string, THREE.Quaternion> {
  const local = new Map<string, THREE.Quaternion>();
  for (const logical of LOGICAL) {
    const name = rig.names[logical];
    if (name && rig.rest.has(name)) local.set(name, localFor(rig, name, deltas[logical] ?? new THREE.Quaternion()));
  }
  return local;
}

/** How much a foot this far above the lowest one (metres) still counts as on the floor: 1, fading to 0 by 8 cm. */
function contact(height: number): number {
  return THREE.MathUtils.clamp(1 - (height - 0.03) / 0.05, 0, 1);
}

/**
 * Soles on the floor come out flat: the ankle closes the chain, in 3D, whatever the hip and knee
 * do. `weights` says how much each foot is on the floor; a foot leaving it fades to its own angle.
 */
function flattenFeet(rig: Rig, local: Map<string, THREE.Quaternion>, deltas: Partial<Record<Logical, THREE.Quaternion>>, hipsPosition: THREE.Vector3, weights: number[]) {
  const fk = forwardKinematics(rig, local, hipsPosition);
  rig.feet.forEach((foot, i) => {
    if (!weights[i]) return;
    const turned = fk.get(foot.shank)!.quat.clone().multiply(rig.anatomical.get(foot.shank)!.clone().invert());
    const level = arc(Y.clone().applyQuaternion(turned).normalize(), Y);
    const flat = turned.clone().invert().multiply(level).multiply(turned);
    local.set(foot.name, localFor(rig, foot.name, (deltas[foot.logical] ?? new THREE.Quaternion()).clone().slerp(flat, weights[i])));
  });
}

/**
 * Standing: the feet decide where the body is. The pelvis goes where the lowest foot touches the
 * floor and the feet that carry the body stay at home. Feet not flat keep their ankles, so the
 * toes are what stays down.
 */
function standOnFeet(
  p: PoseAngles,
  rig: Rig,
  local: Map<string, THREE.Quaternion>,
  deltas: Partial<Record<Logical, THREE.Quaternion>>,
  hipsAtRest: THREE.Vector3,
): { offset: THREE.Vector3; support: number[] } {
  const offset = new THREE.Vector3();
  if (!rig.feet.length) return { offset, support: [] };
  if (p.feet_flat !== false) {
    const free = forwardKinematics(rig, local, hipsAtRest);
    const heights = rig.feet.map((foot) => (foot.side === p.free_foot ? Infinity : free.get(foot.name)!.pos.y));
    const lowest = Math.min(...heights);
    flattenFeet(rig, local, deltas, hipsAtRest, heights.map((h) => contact(h - lowest)));
  }
  let fk = forwardKinematics(rig, local, hipsAtRest);
  if (p.feet_flat === false) {
    // Heels up: the foot bends at the toes, which stay flat on the floor.
    for (const foot of rig.feet) {
      if (!foot.toe) continue;
      const turned = fk.get(foot.name)!.quat.clone().multiply(rig.anatomical.get(foot.name)!.clone().invert());
      const level = arc(Y.clone().applyQuaternion(turned).normalize(), Y);
      local.set(foot.toe, localFor(rig, foot.toe, turned.clone().invert().multiply(level).multiply(turned)));
    }
    fk = forwardKinematics(rig, local, hipsAtRest);
  }
  const drops = rig.feet.map((foot) => {
    if (foot.side === p.free_foot) return Infinity;
    const ankle = fk.get(foot.name)!.pos.y - foot.ankleRestY;
    const toe = foot.toe ? fk.get(foot.toe)?.pos.y : undefined;
    return toe === undefined ? ankle : Math.min(ankle, toe - foot.toeRestY);
  });
  const lowest = Math.min(...drops);
  const support = drops.map((drop) => contact(drop - lowest));
  const total = support.reduce((a, b) => a + b, 0);
  rig.feet.forEach((foot, i) => {
    const pos = fk.get(foot.name)!.pos;
    offset.x += ((foot.home.x - pos.x) * support[i]) / total;
    offset.z += ((foot.home.z - pos.z) * support[i]) / total;
  });
  offset.y = -lowest;
  return { offset, support };
}

type WorldTransform = { pos: THREE.Vector3; quat: THREE.Quaternion };

/** World transform of every bone for a set of local quaternions (rest positions, hips moved). */
function forwardKinematics(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3): Map<string, WorldTransform> {
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
  for (const name of rig.rest.keys()) worldOf(name);
  return out;
}

/** Shortest rotation taking unit vector a onto unit vector b. */
function arc(a: THREE.Vector3, b: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(a, b);
}

/** Rotation whose frame maps the rest pair (axis, normal) onto the wanted pair. */
function frameDelta(axisRest: THREE.Vector3, normalRest: THREE.Vector3, axis: THREE.Vector3, normal: THREE.Vector3): THREE.Quaternion {
  const ortho = (ax: THREE.Vector3, n: THREE.Vector3) => n.clone().sub(ax.clone().multiplyScalar(n.dot(ax))).normalize();
  const nR = ortho(axisRest, normalRest);
  const nW = ortho(axis, normal);
  const mRest = new THREE.Matrix4().makeBasis(axisRest, nR, axisRest.clone().cross(nR));
  const mWant = new THREE.Matrix4().makeBasis(axis, nW, axis.clone().cross(nW));
  return new THREE.Quaternion().setFromRotationMatrix(mWant.multiply(mRest.transpose()));
}

/**
 * Two-bone IK of each arm onto the implement: the hand socket lands on its grip point (bar centre
 * ± half the grip width), the elbow stays on the side the pose put it (the FK elbow is the pole
 * hint), and the palm faces the bar as the catalog grip says. Overrides the upper arm and forearm
 * of the pose; everything else keeps the FK result.
 */
function solveArmsToImplement(p: PoseAngles, rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3, ctx: SolveContext) {
  const imp = p.implement;
  if (!imp) return;
  const fk = forwardKinematics(rig, local, hipsPosition);
  const centre = new THREE.Vector3(0, imp.height_m, imp.forward_m);
  const barAxis = new THREE.Vector3(1, 0, 0);
  const posOf = (logical: Logical) => {
    const name = rig.names[logical];
    return name ? rig.rest.get(name)?.worldPosition : undefined;
  };

  for (const side of ["left", "right"] as const) {
    const s = side === "left" ? 1 : -1;
    const upper = side === "left" ? "LeftArm" : "RightArm";
    const fore = side === "left" ? "LeftForeArm" : "RightForeArm";
    const hand = side === "left" ? "LeftHand" : "RightHand";
    const nUpper = rig.names[upper];
    const nFore = rig.names[fore];
    const nHand = rig.names[hand];
    if (!nUpper || !nFore || !nHand) continue;
    const rUpper = rig.rest.get(nUpper)!;
    const wUpper = fk.get(nUpper);
    const wFore = fk.get(nFore);
    const pUpper0 = posOf(upper), pFore0 = posOf(fore), pHand0 = posOf(hand);
    if (!wUpper || !wFore || !pUpper0 || !pFore0 || !pHand0) continue;

    const L1 = pUpper0.distanceTo(pFore0);
    const socket = ctx.sockets.find((so) => so.bone === nHand);
    const socketOffset = new THREE.Vector3(...(socket?.offset ?? [0, 0, 0]));
    const grip = centre.clone().addScaledVector(barAxis, (s * imp.grip_width_m) / 2);
    const facing = palmFacing(ctx.grip, side);
    const S = wUpper.pos;

    // The hand keeps its place on the forearm, so the socket is a fixed point of the forearm
    // frame: elbow → wrist → socket. Solve the two-bone chain to that point directly (segment
    // lengths L1 and |gRest|), and the socket lands on the grip exactly. All of it measured in the
    // anatomical position: arm straight down, palm forward.
    const gRest = DOWN.clone().multiplyScalar(pFore0.distanceTo(pHand0)).add(socketOffset.clone().applyQuaternion(rig.anatomical.get(nHand)!));
    const L2 = Math.max(gRest.length(), 1e-3);
    const gRestDir = gRest.clone().normalize();

    const toTarget = grip.clone().sub(S);
    const d = THREE.MathUtils.clamp(toTarget.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
    const u = toTarget.normalize();
    // Pole: where the pose already put the elbow, projected off the shoulder→target line.
    let v = wFore.pos.clone().sub(S);
    v.sub(u.clone().multiplyScalar(v.dot(u)));
    if (v.lengthSq() < 1e-6) v = new THREE.Vector3(0, -1, 0).addScaledVector(u, u.y);
    if (v.lengthSq() < 1e-6) v = new THREE.Vector3(0, 0, -1);
    v.normalize();
    const alpha = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const elbow = S.clone().addScaledVector(u, Math.cos(alpha) * L1).addScaledVector(v, Math.sin(alpha) * L1);
    const end = S.clone().addScaledVector(u, d);
    const dirUpper = elbow.clone().sub(S).normalize();
    const dirG = end.clone().sub(elbow).normalize();
    // The grip decides where the palm faces the bar.
    const palm =
      facing === "neutral"
        ? new THREE.Vector3(-s, 0, 0)
        : facing === "supinated"
          ? dirG.clone().cross(barAxis)
          : barAxis.clone().cross(dirG);
    if (palm.lengthSq() < 1e-6) palm.set(0, 0, -1);
    palm.normalize();
    const qUpperWorld = arc(DOWN, dirUpper).multiply(rig.anatomical.get(nUpper)!);
    const qForeWorld = frameDelta(gRestDir, Z, dirG, palm).multiply(rig.anatomical.get(nFore)!);

    const parentUpper = rUpper.parent ? fk.get(rUpper.parent)?.quat : rig.parentWorld.get(nUpper);
    local.set(nUpper, (parentUpper ?? new THREE.Quaternion()).clone().invert().multiply(qUpperWorld));
    local.set(nFore, qUpperWorld.clone().invert().multiply(qForeWorld));
    // The hand keeps the pose's own wrist flexion relative to the forearm.
  }
}

/**
 * Two-bone IK: the end of a chain lands on its target, the mid joint stays on the side the pose
 * put it, and a straight chain bends towards `pole`. Overrides the two bones of the pose.
 */
function reachChain(rig: Rig, local: Map<string, THREE.Quaternion>, fk: Map<string, WorldTransform>, root: string, mid: string, end: string, target: THREE.Vector3, pole: THREE.Vector3, hinge = false) {
  const a = fk.get(root)!;
  const b = fk.get(mid)!;
  const c = fk.get(end)!;
  const L1 = a.pos.distanceTo(b.pos);
  const L2 = b.pos.distanceTo(c.pos);
  const reach = target.clone().sub(a.pos);
  const d = THREE.MathUtils.clamp(reach.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const u = reach.normalize();
  const side = perpendicular(pole.clone().applyQuaternion(a.quat.clone().multiply(rig.anatomical.get(root)!.clone().invert())), u);
  let v = perpendicular(b.pos.clone().sub(a.pos), u);
  if (v.lengthSq() < 1e-6) v = side.clone();
  v.normalize();
  // A knee only bends one way, whatever the pose asked for.
  if (hinge && v.dot(side) < 0) v.negate();
  const alpha = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const joint = a.pos.clone().addScaledVector(u, Math.cos(alpha) * L1).addScaledVector(v, Math.sin(alpha) * L1);
  const tip = a.pos.clone().addScaledVector(u, d);
  const turnRoot = arc(b.pos.clone().sub(a.pos).normalize(), joint.clone().sub(a.pos).normalize());
  const qRoot = turnRoot.clone().multiply(a.quat);
  const oldLower = c.pos.clone().sub(b.pos).normalize().applyQuaternion(turnRoot);
  const qMid = arc(oldLower, tip.clone().sub(joint).normalize()).multiply(turnRoot).multiply(b.quat);
  const r = rig.rest.get(root)!;
  const parent = (r.parent ? fk.get(r.parent)?.quat : rig.parentWorld.get(root)) ?? new THREE.Quaternion();
  local.set(root, parent.clone().invert().multiply(qRoot));
  local.set(mid, qRoot.clone().invert().multiply(qMid));
}

/** The legs reach their feet: the ankle lands on its target, knees bend forward. */
function reachFeet(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3, targets: (THREE.Vector3 | null)[]) {
  const fk = forwardKinematics(rig, local, hipsPosition);
  rig.feet.forEach((foot, i) => {
    if (targets[i]) reachChain(rig, local, fk, foot.thigh, foot.shank, foot.name, targets[i]!, Z, true);
  });
}

/** A foot off the floor stays off it: a pointed rear foot is lifted out of the ground by bending its leg. */
function keepOffFloor(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3, side: "left" | "right") {
  const fk = forwardKinematics(rig, local, hipsPosition);
  const foot = rig.feet.find((f) => f.side === side);
  if (!foot) return;
  const tip = fk.get(foot.tip)!.pos.y;
  const below = foot.tipRestY - tip;
  if (below > 0) reachChain(rig, local, fk, foot.thigh, foot.shank, foot.name, fk.get(foot.name)!.pos.clone().setY(fk.get(foot.name)!.pos.y + below), Z, true);
}

/** Hands on the floor lie flat, fingers forward: the wrist bends as far as it takes. */
function flattenHands(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3) {
  const fk = forwardKinematics(rig, local, hipsPosition);
  const flat = frameDelta(DOWN, Z, Z, DOWN);
  for (const arm of rig.arms) {
    const world = flat.clone().multiply(rig.anatomical.get(arm.hand)!);
    local.set(arm.hand, fk.get(arm.fore)!.quat.clone().invert().multiply(world));
  }
}

/** The arms reach their hands: elbows bend back. */
function reachHands(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3, targets: (THREE.Vector3 | null)[]) {
  const fk = forwardKinematics(rig, local, hipsPosition);
  const back = Z.clone().negate();
  rig.arms.forEach((arm, i) => {
    if (targets[i]) reachChain(rig, local, fk, arm.upper, arm.fore, arm.hand, targets[i]!, back);
  });
}

// ---------------------------------------------------------------------------
// Limb solver in angle space: moves a hand, foot or knee to a target by searching the limb's own
// joint angles inside their range of motion (JOINT_LIMITS). What it finds is a pose like any
// other: the sliders show it, and no joint ever leaves its range.
// ---------------------------------------------------------------------------

export type Limb = "left_arm" | "right_arm" | "left_leg" | "right_leg";
export type LimbEffector = "end" | "mid";

const LIMB_CHAIN: Record<Limb, { root: Logical; mid: Logical; end: Logical; dofs: string[] }> = {
  left_arm: { root: "LeftArm", mid: "LeftForeArm", end: "LeftHand", dofs: ["left_arm.shoulder_elevation", "left_arm.shoulder_plane", "left_arm.shoulder_rotation", "left_arm.elbow_flexion"] },
  right_arm: { root: "RightArm", mid: "RightForeArm", end: "RightHand", dofs: ["right_arm.shoulder_elevation", "right_arm.shoulder_plane", "right_arm.shoulder_rotation", "right_arm.elbow_flexion"] },
  left_leg: { root: "LeftUpLeg", mid: "LeftLeg", end: "LeftFoot", dofs: ["left_leg.hip_flexion", "left_leg.hip_abduction", "left_leg.hip_rotation", "left_leg.knee_flexion"] },
  right_leg: { root: "RightUpLeg", mid: "RightLeg", end: "RightFoot", dofs: ["right_leg.hip_flexion", "right_leg.hip_abduction", "right_leg.hip_rotation", "right_leg.knee_flexion"] },
};

/** World positions of a limb's mid and end joints for a pose, given the rest of the body (fk). */
function chainPositions(rig: Rig, fk: Map<string, WorldTransform>, pose: PoseAngles, limb: Limb): { mid: THREE.Vector3; end: THREE.Vector3 } | null {
  const chain = LIMB_CHAIN[limb];
  const names = [rig.names[chain.root], rig.names[chain.mid], rig.names[chain.end]];
  if (names.some((n) => !n)) return null;
  const deltas = characterDeltas(pose, rig);
  const logicals: Logical[] = [chain.root, chain.mid, chain.end];
  const rootRest = rig.rest.get(names[0]!)!;
  let parent: WorldTransform | undefined = rootRest.parent ? fk.get(rootRest.parent) : undefined;
  if (!parent) {
    const pq = rig.parentWorld.get(names[0]!) ?? new THREE.Quaternion();
    parent = { pos: rootRest.worldPosition.clone().sub(rootRest.position.clone().multiplyScalar(rootRest.parentWorldScale).applyQuaternion(pq)), quat: pq };
  }
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < 3; i += 1) {
    const name = names[i]!;
    const r = rig.rest.get(name)!;
    const local = localFor(rig, name, deltas[logicals[i]] ?? new THREE.Quaternion());
    const pos = parent.pos.clone().add(r.position.clone().multiplyScalar(r.parentWorldScale).applyQuaternion(parent.quat));
    const quat = parent.quat.clone().multiply(local);
    positions.push(pos);
    parent = { pos, quat };
  }
  return { mid: positions[1], end: positions[2] };
}

/**
 * Coordinate descent over the limb's joint angles (clamped to their range of motion) so that its
 * end (hand / foot) or mid joint (elbow / knee) comes as close as the range allows to `target`.
 */
function solveLimbAngles(rig: Rig, fk: Map<string, WorldTransform>, pose: PoseAngles, limb: Limb, effector: LimbEffector, target: THREE.Vector3): PoseAngles {
  const chain = LIMB_CHAIN[limb];
  const dofs = effector === "mid" ? chain.dofs.slice(0, 3) : chain.dofs;
  const errorOf = (p: PoseAngles) => {
    const c = chainPositions(rig, fk, p, limb);
    return c ? (effector === "mid" ? c.mid : c.end).distanceToSquared(target) : Infinity;
  };
  let best = pose;
  let bestErr = errorOf(best);
  if (!Number.isFinite(bestErr)) return pose;
  let step = 24;
  for (let iter = 0; iter < 120 && step >= 0.2 && bestErr > 1e-8; iter += 1) {
    let improved = false;
    for (const dof of dofs) {
      const current = getPoseValue(best, dof) ?? 0;
      for (const sign of [1, -1]) {
        const candidate = clampToLimit(dof, current + sign * step);
        if (candidate === current) continue;
        const trial = setPoseValue(best, dof, candidate);
        const err = errorOf(trial);
        if (err < bestErr - 1e-9) {
          best = trial;
          bestErr = err;
          improved = true;
          break;
        }
      }
    }
    if (!improved) step /= 2;
  }
  return best;
}

/** Where a clip's first pose leaves the feet, the toes and the hands (rig order); null for a foot not carrying the body. */
function plantedBody(rig: Rig, ctx: SolveContext): Planted {
  const stance = ctx.stance;
  const none = { feet: rig.feet.map(() => null), toes: rig.feet.map(() => null), knees: rig.feet.map(() => null), hands: rig.arms.map(() => null) };
  if (!stance) return none;
  const known = rig.planted.get(stance);
  if (known) return known;
  const core = solvePose(stance, rig, { ...ctx, stance: undefined });
  const fk = forwardKinematics(rig, core.local, core.hipsPosition);
  const planted: Planted = {
    feet: rig.feet.map((foot, i) => (stance.orientation === "standing" && core.support[i] > 0.5 ? fk.get(foot.name)!.pos.clone() : null)),
    toes: rig.feet.map((foot) => fk.get(foot.tip)!.pos.clone()),
    knees: rig.feet.map((foot) => fk.get(foot.shank)!.pos.clone()),
    hands: rig.arms.map((arm) => fk.get(arm.hand)!.pos.clone()),
  };
  rig.planted.set(stance, planted);
  return planted;
}

/** A height that depends on the rig, measured at the wrist where it is something the hands hold. */
function refHeight(rig: Rig, ref: HeightRef): number {
  const { knee, hip, shoulder } = rig.heights;
  const grip = 0.08; // wrist above the bar in the hand
  switch (ref) {
    case "floor": return 0.05;
    case "bar_on_floor": return 0.22 + grip;
    case "mid_shin": return knee * 0.6 + grip;
    case "knee": return knee + grip;
    case "mid_thigh": return (knee + hip) / 2 + grip;
    case "hip": return hip;
    case "shoulder": return shoulder;
  }
}

/** The pose with its goal reached: the pelvis height or the pitch that puts the point at its height, searched on the rig. */
function reachGoal(p: PoseAngles, rig: Rig, ctx: SolveContext): PoseAngles {
  const goal = p.goal;
  if (!goal) return p;
  const target = (goal.ref ? refHeight(rig, goal.ref) : 0) + (goal.height_m ?? 0);
  const posed = (value: number): PoseAngles => ({ ...p, goal: undefined, hips: { ...p.hips, ...(goal.by === "pelvis" ? { height_m: value } : { pitch: value }) } });
  const error = (value: number) => {
    const core = solvePoseCore(posed(value), rig, ctx);
    const fk = forwardKinematics(rig, core.local, core.hipsPosition);
    const names = goal.point === "hands" ? rig.arms.map((a) => a.hand) : rig.arms.map((a) => a.upper);
    return names.reduce((sum, n) => sum + fk.get(n)!.pos.y, 0) / Math.max(names.length, 1) - target;
  };
  const [lo, hi] = goal.by === "pelvis" ? [0.2, rig.hipsRestY + 0.1] : [0, 120];
  const steps = 24;
  let best = lo;
  let bestError = Infinity;
  let bracket: [number, number] | null = null;
  let previous = error(lo);
  for (let i = 1; i <= steps; i += 1) {
    const value = lo + ((hi - lo) * i) / steps;
    const e = error(value);
    if (Math.abs(e) < bestError) [best, bestError] = [value, Math.abs(e)];
    if (!bracket && e * previous <= 0) bracket = [value - (hi - lo) / steps, value];
    previous = e;
  }
  if (bracket) {
    let [a, b] = bracket;
    let ea = error(a);
    for (let i = 0; i < 16; i += 1) {
      const m = (a + b) / 2;
      const em = error(m);
      if (em * ea <= 0) b = m;
      else [a, ea] = [m, em];
    }
    best = (a + b) / 2;
  }
  return posed(best);
}

/** The pose as it will be drawn: its goal reached, pinned points become limb angles. */
function resolvePose(given: PoseAngles, rig: Rig, ctx: SolveContext): PoseAngles {
  const p = reachGoal(given, rig, ctx);
  const anchors = p.anchors;
  if (!anchors || !Object.keys(anchors).length) return p;
  let pose = p;
  // The pelvis follows the legs when standing, so solve, re-read the body, solve again.
  for (let pass = 0; pass < 5; pass += 1) {
    const core = solvePoseCore(pose, rig, ctx);
    const fk = forwardKinematics(rig, core.local, core.hipsPosition);
    for (const side of ["left", "right"] as const) {
      const foot = anchors[`${side}_foot`];
      const knee = anchors[`${side}_knee`];
      const hand = anchors[`${side}_hand`];
      if (foot) pose = solveLimbAngles(rig, fk, pose, `${side}_leg`, "end", new THREE.Vector3(...foot));
      else if (knee) pose = solveLimbAngles(rig, fk, pose, `${side}_leg`, "mid", new THREE.Vector3(...knee));
      if (hand && !(ctx.twoHanded && p.implement)) pose = solveLimbAngles(rig, fk, pose, `${side}_arm`, "end", new THREE.Vector3(...hand));
    }
  }
  return pose;
}

/**
 * Move a limb so its hand / foot (or elbow / knee) reaches a world point, inside every joint's
 * range of motion: the pose with the new angles, for the editor to keep.
 */
export function solveLimbToTarget(
  model: THREE.Object3D,
  rest: RestPose,
  pose: PoseAngles,
  ctx: SolveContext,
  limb: Limb,
  effector: LimbEffector,
  target: [number, number, number],
): PoseAngles {
  const rig = buildRig(model, rest);
  const core = solvePoseCore(pose, rig, ctx);
  const fk = forwardKinematics(rig, core.local, core.hipsPosition);
  const solved = solveLimbAngles(rig, fk, pose, limb, effector, new THREE.Vector3(...target));
  // A foot of a later pose is planted where the first pose put it: dragging it away pins it there.
  if (effector !== "end" || !limb.endsWith("_leg") || !ctx.stance || ctx.stance === pose || pose.orientation !== "standing") return solved;
  const id: AnchorId = limb === "left_leg" ? "left_foot" : "right_foot";
  return { ...solved, anchors: { ...solved.anchors, [id]: target } };
}

function solvePose(p: PoseAngles, rig: Rig, ctx: SolveContext): Solved {
  return solvePoseCore(resolvePose(p, rig, ctx), rig, ctx);
}

/**
 * Angles → bone rotations, the pelvis and the bar IK. Standing, the feet that carry the body go
 * where they belong (a pin, where the first pose planted them, or where the legs had them when
 * the pelvis was moved by hand) and the legs reach them from the pelvis. Cheap: this runs for
 * every frame of a clip.
 */
function solvePoseCore(p: PoseAngles, rig: Rig, ctx: SolveContext): Solved {
  const deltas = characterDeltas(p, rig);
  const local = locals(rig, deltas);
  const hipsName = rig.names.Hips;
  const hipsRest = hipsName ? rig.rest.get(hipsName) : undefined;
  const hipsPosition = hipsRest ? hipsRest.position.clone() : new THREE.Vector3();
  const hipsOffset = new THREE.Vector3();
  let support: number[] = [];
  const later = ctx.stance && ctx.stance !== p;
  const planted = later ? plantedBody(rig, ctx) : null;
  if (hipsName && hipsRest) {
    const pw = rig.parentWorld.get(hipsName) ?? new THREE.Quaternion();
    // World metres → the parent's local frame and units (a Mixamo rig sits in centimetres under a scaled Armature).
    const placed = () => hipsRest.position.clone().add(hipsOffset.clone().applyQuaternion(pw.clone().invert()).divideScalar(hipsRest.parentWorldScale || 1));
    if (p.orientation === "standing") {
      const stood = standOnFeet(p, rig, local, deltas, hipsPosition);
      hipsOffset.copy(stood.offset);
      support = stood.support;
      const moved = p.hips.height_m !== null || p.hips.forward_m !== 0;
      const fk = forwardKinematics(rig, local, placed());
      const targets = rig.feet.map((foot, i) => {
        const pin = p.anchors?.[`${foot.side}_foot`];
        if (pin) return new THREE.Vector3(...pin);
        if (support[i] <= 0.5) return null;
        const here = fk.get(foot.name)!.pos;
        const there = p.steps ? null : planted?.feet[i];
        if (there && there.distanceTo(here) < STEP_M) return there;
        return moved ? here.clone() : null;
      });
      if (p.hips.height_m !== null) hipsOffset.y = p.hips.height_m - rig.hipsRestY;
      hipsOffset.z += p.hips.forward_m;
      hipsPosition.copy(placed());
      if (targets.some(Boolean)) {
        reachFeet(rig, local, hipsPosition, targets);
        if (p.feet_flat !== false) flattenFeet(rig, local, deltas, hipsPosition, support);
      }
      if (p.free_foot) keepOffFloor(rig, local, hipsPosition, p.free_foot);
    } else {
      // Any other support: a height set by hand, else the orientation's default.
      const y = p.hips.height_m ?? HIPS_HEIGHT_BY_ORIENTATION[p.orientation as Exclude<typeof p.orientation, "standing">] ?? 0.9;
      hipsOffset.set(0, y - rig.hipsRestY, p.hips.forward_m);
      if (p.toes_down !== undefined && rig.feet.length) {
        // The body pivots on its toes: they stay on the floor, where the first pose left them.
        const fk = forwardKinematics(rig, local, placed());
        const tips = rig.feet.map((foot) => fk.get(foot.tip)!.pos);
        hipsOffset.y += p.toes_down + rig.feet[0].tipRestY - Math.min(...tips.map((t) => t.y));
        const first = planted?.toes[0];
        if (first) hipsOffset.z += first.z - tips[0].z;
      } else if (p.knees_down && rig.feet.length) {
        // Same on the knees: a kneecap's thickness above the floor.
        const fk = forwardKinematics(rig, local, placed());
        const knees = rig.feet.map((foot) => fk.get(foot.shank)!.pos);
        hipsOffset.y += KNEE_ABOVE_FLOOR - Math.min(...knees.map((k) => k.y));
        // Toes curled under lift the knees a little rather than go through the floor.
        const kneeLift = KNEE_ABOVE_FLOOR - Math.min(...knees.map((k) => k.y));
        const tipBelow = Math.max(...rig.feet.map((foot) => foot.tipRestY - (fk.get(foot.tip)!.pos.y + kneeLift)));
        if (tipBelow > 0) hipsOffset.y += tipBelow;
        const first = planted?.knees[0];
        if (first) hipsOffset.z += first.z - knees[0].z;
      }
      hipsPosition.copy(placed());
      if ((p.orientation === "seated" || p.orientation === "supine") && p.feet_flat === true) {
        // Sitting or on the back with the feet down: they rest on the floor where the legs put them.
        const fk = forwardKinematics(rig, local, hipsPosition);
        reachFeet(rig, local, hipsPosition, rig.feet.map((foot) => fk.get(foot.name)!.pos.clone().setY(foot.ankleRestY)));
        flattenFeet(rig, local, deltas, hipsPosition, rig.feet.map(() => 1));
      }
    }
  }
  if (ctx.twoHanded && p.implement) solveArmsToImplement(p, rig, local, hipsPosition, ctx);
  else if (p.plant_hands && planted) reachHands(rig, local, hipsPosition, planted.hands);
  if (p.hands_flat) flattenHands(rig, local, hipsPosition);
  return { local, hipsPosition, hipsOffset, support };
}

/** Where every logical bone ends up for a pose: world position and rotation (checks, validation). */
export function solveWorld(model: THREE.Object3D, rest: RestPose, pose: PoseAngles, ctx: SolveContext): Partial<Record<Logical, { position: THREE.Vector3; quaternion: THREE.Quaternion }>> {
  const rig = buildRig(model, rest);
  const { local, hipsPosition } = solvePose(pose, rig, ctx);
  const fk = forwardKinematics(rig, local, hipsPosition);
  const out: Partial<Record<Logical, { position: THREE.Vector3; quaternion: THREE.Quaternion }>> = {};
  for (const logical of LOGICAL) {
    const t = rig.names[logical] ? fk.get(rig.names[logical]!) : undefined;
    if (t) out[logical] = { position: t.pos, quaternion: t.quat };
  }
  return out;
}

/** World position of the pinnable points of a pose on this rig (what the editor pins to). */
export function probePose(model: THREE.Object3D, rest: RestPose, pose: PoseAngles, ctx: SolveContext): Record<string, [number, number, number]> {
  const rig = buildRig(model, rest);
  const { local, hipsPosition } = solvePose(pose, rig, ctx);
  const fk = forwardKinematics(rig, local, hipsPosition);
  const out: Record<string, [number, number, number]> = {};
  const read = (id: string, logical: Logical) => {
    const name = rig.names[logical];
    const t = name ? fk.get(name) : undefined;
    if (t) out[id] = [+t.pos.x.toFixed(3), +t.pos.y.toFixed(3), +t.pos.z.toFixed(3)];
  };
  read("hips", "Hips");
  read("left_foot", "LeftFoot");
  read("right_foot", "RightFoot");
  read("left_hand", "LeftHand");
  read("right_hand", "RightHand");
  read("left_knee", "LeftLeg");
  read("right_knee", "RightLeg");
  return out;
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** A clip's keyframes ready to play on a rig: goals reached, pins solved, and the pose at any time. */
function clipPlayer(rig: Rig, clip: PoseClipJson, sockets: AvatarSocket[], stance?: PoseAngles) {
  const keys = [...clip.keyframes].sort((a, b) => a.t - b.t);
  if (!keys.length) throw new Error("The pose clip has no keyframes");
  const ctx: SolveContext = {
    twoHanded: clip.meta?.two_handed === true,
    grip: typeof clip.meta?.grip === "string" ? clip.meta.grip : null,
    sockets,
    stance: stance ?? keys[0].angles,
  };
  // The first pose is what the others are planted on: its goal is reached before anything else.
  const firstResolved = resolvePose(ctx.stance!, rig, { ...ctx, stance: undefined });
  ctx.stance = firstResolved;
  const resolved = keys.map((k, i) => (i === 0 && !stance ? firstResolved : resolvePose(k.angles, rig, ctx)));
  // Between a pelvis height set by hand and an automatic one, the automatic pose gets its number.
  const heighted = (i: number, other: number) => {
    const pose = resolved[i];
    if (pose.hips.height_m !== null || resolved[other].hips.height_m === null) return pose;
    return { ...pose, hips: { ...pose.hips, height_m: rig.hipsRestY + solvePoseCore(pose, rig, ctx).hipsOffset.y } };
  };
  const duration = Math.max(clip.duration, keys[keys.length - 1].t, 1 / clip.fps);
  const poseAt = (t: number) => {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i += 1;
    const next = Math.min(i + 1, keys.length - 1);
    const span = keys[next].t - keys[i].t;
    const u = span > 0 ? ease(Math.min(1, Math.max(0, (t - keys[i].t) / span))) : 0;
    return lerpPose(heighted(i, next), heighted(next, i), u);
  };
  return { ctx, keys, resolved, duration, poseAt };
}

/**
 * The three.js clip for a pose-angles json on this model. The angles are what is interpolated and
 * every frame is solved, so the feet stay down and the bar stays in the hands between keyframes.
 */
export function buildPoseClip(model: THREE.Object3D, saved: PoseClipJson, rest: RestPose, sockets: AvatarSocket[] = [], stance?: PoseAngles): THREE.AnimationClip {
  const clip = upgradePoseClip(saved);
  const rig = buildRig(model, rest);
  const { ctx, resolved, duration, poseAt } = clipPlayer(rig, clip, sockets, stance);
  const fps = Math.min(120, Math.max(1, clip.fps));
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Float32Array(frames);
  const bones = [...solvePoseCore(resolved[0], rig, ctx).local.keys()];
  const rot = new Map(bones.map((b) => [b, new Float32Array(frames * 4)]));
  const hips = new Float32Array(frames * 3);

  for (let f = 0; f < frames; f += 1) {
    const t = Math.min(duration, f / fps);
    times[f] = t;
    const { local, hipsPosition } = solvePoseCore(poseAt(t), rig, ctx);
    for (const bone of bones) {
      const q = local.get(bone);
      if (q) rot.get(bone)!.set([q.x, q.y, q.z, q.w], f * 4);
    }
    hips.set([hipsPosition.x, hipsPosition.y, hipsPosition.z], f * 3);
  }

  const tracks: THREE.KeyframeTrack[] = bones.map((bone) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, rot.get(bone)!));
  if (rig.names.Hips) tracks.push(new THREE.VectorKeyframeTrack(`${rig.names.Hips}.position`, times, hips));
  return new THREE.AnimationClip("pose-angles", duration, tracks);
}

export type ClipSample = {
  t: number;
  pose: PoseAngles;
  /** Every logical bone, world. */
  bones: Partial<Record<Logical, { position: THREE.Vector3; quaternion: THREE.Quaternion }>>;
  /** The lowest bone of the rig. */
  lowest: { bone: string; y: number };
  /** How much each foot carries the body, and its sole's tilt from flat, degrees. */
  feet: { side: "left" | "right"; support: number; tilt: number; ankle: THREE.Vector3 }[];
};

/** The clip solved at `count` moments: what the validator looks at. */
export function sampleClip(model: THREE.Object3D, saved: PoseClipJson, rest: RestPose, sockets: AvatarSocket[] = [], count = 24): { samples: ClipSample[]; resolved: PoseAngles[]; ankleFloor: number; anatomyFront: number } {
  const clip = upgradePoseClip(saved);
  const rig = buildRig(model, rest);
  const { ctx, resolved, duration, poseAt } = clipPlayer(rig, clip, sockets);
  const samples: ClipSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (duration * i) / Math.max(1, count - 1);
    const pose = poseAt(t);
    const core = solvePoseCore(pose, rig, ctx);
    const fk = forwardKinematics(rig, core.local, core.hipsPosition);
    const bones: ClipSample["bones"] = {};
    for (const logical of LOGICAL) {
      const w = rig.names[logical] ? fk.get(rig.names[logical]!) : undefined;
      if (w) bones[logical] = { position: w.pos, quaternion: w.quat };
    }
    samples.push({
      t,
      pose,
      bones,
      lowest: [...fk.entries()].reduce((low, [bone, w]) => (w.pos.y < low.y ? { bone, y: w.pos.y } : low), { bone: "", y: Infinity }),
      feet: rig.feet.map((foot, k) => {
        const turned = fk.get(foot.name)!.quat.clone().multiply(rig.anatomical.get(foot.name)!.clone().invert());
        return { side: foot.side, support: core.support[k] ?? 0, tilt: THREE.MathUtils.radToDeg(Y.clone().applyQuaternion(turned).angleTo(Y)), ankle: fk.get(foot.name)!.pos.clone() };
      }),
    });
  }
  return { samples, resolved, ankleFloor: rig.feet[0]?.ankleRestY ?? 0, anatomyFront: rig.feet[0]?.home.z ?? 0 };
}
