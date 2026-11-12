/**
 * The inverse of characterDeltas (pose-deltas.ts): the editor's angles (PoseAngles) read back from
 * where the avatar's bones are at one instant. Each bone's rotation away from the rig's anatomical
 * position (its calibration) is measured in the character frame, relative to the posed bone above
 * it, which is the frame characterDeltas writes in; each group of angles is then taken apart in
 * the order characterDeltas builds it. Where several bones share angles (the spine's segments, the
 * neck and the head) a small least-squares fit finds the angles that put every bone back.
 *
 * Angles outside the editor's joint limits are held at the limit, and said. Bones the capture did
 * not drive (`driven`) stay at the anatomical position instead of reading the rig's rest pose.
 */

import * as THREE from "three";
import { NEUTRAL_POSE, clampToLimit, getPoseValue, limitOf, setPoseValue, swingAxis, type PoseAngles } from "./anatomy.ts";
import { bodyDifference, type Deltas } from "./body-difference.ts";
import { CLAVICLE_RISE, LOGICAL_BONES, characterDeltas, forwardKinematics, type Logical, type Rig, type WorldTransform } from "./pose-clip.ts";
import { fit, fitResidual, rotationVector, swingTwist } from "./rotation-fit.ts";

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export type { Deltas } from "./body-difference.ts";
export { angleBetween } from "./rotation-fit.ts";
export { bodyDifference } from "./body-difference.ts";

/** The posed bone above each posed bone of the rig (null for the top of the chain), cached per rig. */
const parents = new WeakMap<Rig, Map<Logical, Logical | null>>();

function logicalParents(rig: Rig): Map<Logical, Logical | null> {
  const known = parents.get(rig);
  if (known) return known;
  const byName = new Map<string, Logical>();
  for (const logical of LOGICAL_BONES) {
    const name = rig.names[logical];
    if (name && rig.rest.has(name)) byName.set(name, logical);
  }
  const out = new Map<Logical, Logical | null>();
  for (const [name, logical] of byName) {
    let found: Logical | null = null;
    for (let p = rig.rest.get(name)?.parent ?? null; p; p = rig.rest.get(p)?.parent ?? null) {
      const hit = byName.get(p);
      if (hit) {
        found = hit;
        break;
      }
    }
    out.set(logical, found);
  }
  parents.set(rig, out);
  return out;
}

/**
 * Each posed bone's rotation away from the anatomical position, relative to the posed bone above
 * it, in the character frame: what characterDeltas would have to return for these bones.
 */
export function measuredDeltas(rig: Rig, fk: Map<string, WorldTransform>): Deltas {
  const turned = new Map<Logical, THREE.Quaternion>();
  for (const [logical] of logicalParents(rig)) {
    const name = rig.names[logical]!;
    const world = fk.get(name);
    const anatomical = rig.anatomical.get(name);
    if (world && anatomical) turned.set(logical, world.quat.clone().multiply(anatomical.clone().invert()));
  }
  const out: Deltas = {};
  for (const [logical, parent] of logicalParents(rig)) {
    const own = turned.get(logical);
    if (!own) continue;
    const above = parent ? turned.get(parent) : null;
    out[logical] = above ? above.clone().invert().multiply(own) : own.clone();
  }
  return out;
}

const wrap = (deg: number) => {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
};

/** The value `deg` stands for (± 360) that is inside [min, max], or else nearest `near`. */
function unwrapInto(deg: number, path: string, near: number | null): number {
  const { min, max } = limitFor(path);
  const options = [deg - 360, deg, deg + 360];
  const inside = options.filter((v) => v >= min && v <= max);
  const pool = inside.length ? inside : options;
  const target = near ?? (min + max) / 2;
  return pool.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best));
}

const limitFor = limitOf;

type Euler3 = { x: number; y: number; z: number };

/** Both Tait-Bryan readings of a rotation for an axis order (the second turns the middle axis past 90°), in degrees. */
function eulerReadings(q: THREE.Quaternion, order: "XYZ" | "YXZ" | "ZXY" | "ZYX" | "YZX" | "XZY"): [Euler3, Euler3] {
  const e = new THREE.Euler().setFromQuaternion(q, order);
  const a = { x: e.x * DEG, y: e.y * DEG, z: e.z * DEG };
  const axes = order.toLowerCase().split("") as ("x" | "y" | "z")[];
  const b = { ...a };
  b[axes[0]] = wrap(a[axes[0]] + 180);
  b[axes[1]] = wrap(180 - a[axes[1]]);
  b[axes[2]] = wrap(a[axes[2]] + 180);
  return [a, b];
}

/** Of several candidate field values, the one inside the limits, nearest the previous pose. */
function pick(candidates: Record<string, number>[], previous: PoseAngles | null): Record<string, number> {
  let best = candidates[0];
  let bestCost = Infinity;
  for (const c of candidates) {
    let cost = 0;
    for (const [path, v] of Object.entries(c)) {
      const { min, max } = limitFor(path);
      cost += 10 * Math.max(0, min - v, v - max);
      const before = previous ? getPoseValue(previous, path) : null;
      cost += 0.01 * Math.abs(wrap(v - (before ?? 0)));
    }
    if (cost < bestCost) [best, bestCost] = [c, cost];
  }
  return best;
}

const qx = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deg * RAD);
const qy = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deg * RAD);
const qz = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), deg * RAD);
const mul = (...qs: THREE.Quaternion[]) => qs.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const FRONT = new THREE.Vector3(0, 0, 1);

/** Where `v` ends up under two rotations, compared (degrees, roughly: the chord in radians times 180/π). */
function direction(a: THREE.Quaternion, b: THREE.Quaternion, v: THREE.Vector3): number[] {
  const da = v.clone().applyQuaternion(a);
  const db = v.clone().applyQuaternion(b);
  return [(da.x - db.x) * DEG, (da.y - db.y) * DEG, (da.z - db.z) * DEG];
}

/** The toes' heading around the shin: the shank frame's front against `toes`, both taken square to the shin. */
function headingError(shank: THREE.Quaternion, toes: THREE.Vector3): number[] {
  const axis = DOWN.clone().applyQuaternion(shank);
  const mine = FRONT.clone().applyQuaternion(shank).projectOnPlane(axis);
  const want = toes.clone().projectOnPlane(axis);
  if (mine.lengthSq() < 1e-8 || want.lengthSq() < 1e-8) return [0, 0, 0];
  mine.normalize();
  want.normalize();
  return [(mine.x - want.x) * DEG, (mine.y - want.y) * DEG, (mine.z - want.z) * DEG];
}

/** How far each value is outside its joint limits, weighted, so a fit settles on the nearest pose the body can take. */
function outside(paths: string[], x: number[]): number[] {
  return paths.map((path, i) => {
    const { min, max } = limitOf(path);
    return 3 * Math.max(0, min - x[i], x[i] - max);
  });
}

/** Every angle field of a pose, as dot paths (the ones characterDeltas reads). */
export const ANGLE_PATHS: readonly string[] = [
  "hips.pitch", "hips.yaw", "hips.roll",
  ...(["lumbar", "thoracic"] as const).flatMap((s) => ["flexion", "lateral", "twist"].map((k) => `${s}.${k}`)),
  "head.pitch", "head.yaw", "head.lateral",
  ...(["left_arm", "right_arm"] as const).flatMap((a) => Object.keys(NEUTRAL_POSE.left_arm).map((k) => `${a}.${k}`)),
  ...(["left_leg", "right_leg"] as const).flatMap((l) => Object.keys(NEUTRAL_POSE.left_leg).map((k) => `${l}.${k}`)),
];

export type PoseFromBonesResult = {
  pose: PoseAngles;
  /** What had to be held to the joint limits: "left_arm.elbow_flexion: 162 -> 150". */
  clamped: string[];
  /** The largest angle between a driven bone as measured and as the pose puts it, degrees. */
  residual: number;
  /** The bone of that largest difference. */
  worst: Logical | null;
};

export type PoseFromBonesOptions = {
  /** The pose of the moment before, to keep angles continuous (the arm's plane when it hangs, ± 360 turns). */
  previous?: PoseAngles | null;
  /** Logical bones the capture moved; the others stay at the anatomical position. Default: all. */
  driven?: (logical: Logical) => boolean;
  /** Fields the result starts from (orientation, flags): default the anatomical position, standing. */
  base?: PoseAngles;
};

/** PoseAngles from measured deltas (see measuredDeltas). */
export function poseFromDeltas(rig: Rig, measured: Deltas, options: PoseFromBonesOptions = {}): PoseFromBonesResult {
  const previous = options.previous ?? null;
  const driven = options.driven ?? (() => true);
  const has = (l: Logical) => Boolean(rig.names[l] && rig.rest.has(rig.names[l]!) && measured[l]);
  const target = (l: Logical) => (driven(l) && measured[l] ? measured[l]!.clone() : new THREE.Quaternion());
  let pose: PoseAngles = structuredClone(options.base ?? NEUTRAL_POSE);
  const set = (values: Record<string, number>) => {
    for (const [path, v] of Object.entries(values)) pose = setPoseValue(pose, path, v);
  };
  const before = (path: string) => (previous ? getPoseValue(previous, path) : null);
  /** What the bones read before a fit kept a limb inside its range: what the clamp report says. */
  const raw: Record<string, number> = {};

  // Pelvis: yaw, then pitch, then roll.
  if (has("Hips") && driven("Hips")) {
    const [a, b] = eulerReadings(target("Hips"), "YXZ");
    set(pick([a, b].map((e) => ({ "hips.yaw": e.y, "hips.pitch": e.x, "hips.roll": e.z })), previous));
  }

  // Spine: the lowest bone is the lumbar spine, the others share the thoracic.
  const spine = rig.spine.filter((l) => has(l));
  if (spine.length) {
    const segment = (f: number, l: number, t: number, share: number) => mul(qx(f * share), qz(-l * share), qy(t * share));
    const targets = spine.map(target);
    const readSegment = (q: THREE.Quaternion, share: number) => {
      const [e] = eulerReadings(q, "XZY");
      return [e.x / share, -e.z / share, e.y / share];
    };
    if (spine.length === 1) {
      // One bone carries both segments: shared out as the ranges are (lumbar 70 % of flexion, 60 % of side bend, 20 % of twist).
      const share = [0.7, 0.6, 0.2];
      const model = (x: number[]) => {
        const lum = x.map((v, i) => v * share[i]);
        const tho = x.map((v, i) => v * (1 - share[i]));
        return [mul(segment(lum[0], lum[1], lum[2], 1), segment(tho[0], tho[1], tho[2], 1))];
      };
      const x = fit(readSegment(targets[0], 1), model, targets);
      set({ "lumbar.flexion": x[0] * share[0], "lumbar.lateral": x[1] * share[1], "lumbar.twist": x[2] * share[2], "thoracic.flexion": x[0] * (1 - share[0]), "thoracic.lateral": x[1] * (1 - share[1]), "thoracic.twist": x[2] * (1 - share[2]) });
    } else {
      const upper = spine.length - 1;
      const model = (x: number[]) => spine.map((_, i) => (i === 0 ? segment(x[0], x[1], x[2], 1) : segment(x[3], x[4], x[5], 1 / upper)));
      const thoracicTotal = targets.slice(1).reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());
      const x = fit([...readSegment(targets[0], 1), ...readSegment(thoracicTotal, 1)], model, targets);
      set({ "lumbar.flexion": x[0], "lumbar.lateral": x[1], "lumbar.twist": x[2], "thoracic.flexion": x[3], "thoracic.lateral": x[4], "thoracic.twist": x[5] });
    }
  }

  // Neck and head share the head's angles, 40 % and 60 %.
  const headBones = (["Neck", "Head"] as const).filter((l) => has(l));
  if (headBones.length) {
    const part = { Neck: 0.4, Head: 0.6 } as const;
    const model = (x: number[]) => headBones.map((l) => mul(qx(x[0] * part[l]), qy(x[1] * part[l]), qz(-x[2] * part[l])));
    const targets = headBones.map(target);
    const total = targets.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());
    const [e] = eulerReadings(total, "XYZ");
    const scale = headBones.reduce((s, l) => s + part[l], 0);
    const x = fit([e.x / scale, e.y / scale, -e.z / scale], model, targets);
    set({ "head.pitch": x[0], "head.yaw": x[1], "head.lateral": x[2] });
  }

  for (const [side, s, prefix] of [["left", 1, "Left"], ["right", -1, "Right"]] as const) {
    const arm = `${side}_arm`;
    const shoulder = `${prefix}Shoulder` as Logical;
    const upper = `${prefix}Arm` as Logical;
    const fore = `${prefix}ForeArm` as Logical;
    const hand = `${prefix}Hand` as Logical;
    // The shoulder girdle: elevation (with what raising the arm adds), then protraction.
    const girdle = has(shoulder) ? target(shoulder) : new THREE.Quaternion();
    if (!has(upper) || !driven(upper)) continue;
    // The humerus against the thorax, whatever the clavicle took: the swing that raises it, then the turn about it.
    const humerusM = girdle.clone().multiply(target(upper));
    const { swing, twist } = swingTwist(humerusM, Y);
    if (swing.w < 0) swing.set(-swing.x, -swing.y, -swing.z, -swing.w);
    const elevation0 = 2 * Math.acos(Math.min(1, swing.w)) * DEG;
    const plane0 = elevation0 < 0.5 ? (before(`${arm}.shoulder_plane`) ?? 0) : wrap(Math.atan2(-swing.x, s * swing.z) * DEG);
    const x0 = [unwrapInto(plane0, `${arm}.shoulder_plane`, before(`${arm}.shoulder_plane`)), elevation0, unwrapInto(s * twist, `${arm}.shoulder_rotation`, before(`${arm}.shoulder_rotation`)), 0, 0];
    const foreM = has(fore) && driven(fore) ? target(fore) : null;
    if (foreM) {
      // Elbow: the hinge, after the forearm's turn about itself (pronation).
      const st = swingTwist(foreM, Y);
      x0[3] = unwrapInto(-wrap(2 * Math.atan2(st.swing.x, st.swing.w) * DEG), `${arm}.elbow_flexion`, before(`${arm}.elbow_flexion`));
      x0[4] = unwrapInto(-s * st.twist, `${arm}.forearm_pronation`, before(`${arm}.forearm_pronation`));
    }
    const humerusOf = (x: number[]) => mul(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...swingAxis(x[0], s)), x[1] * RAD), qy(s * x[2]));
    const forearmOf = (x: number[], h: THREE.Quaternion) => h.clone().multiply(qx(-x[3])).multiply(qy(-s * x[4]));
    // The chain as a whole: where the elbow and the wrist are and which way the palm faces, so a
    // capture's elbow that is not a pure hinge still lands where it was.
    const paths = [`${arm}.shoulder_plane`, `${arm}.shoulder_elevation`, `${arm}.shoulder_rotation`, `${arm}.elbow_flexion`, `${arm}.forearm_pronation`];
    const forearmM = foreM ? humerusM.clone().multiply(foreM) : null;
    const x = foreM
      ? fitResidual(x0, (x) => {
          const h = humerusOf(x);
          const f = forearmOf(x, h);
          return [
            ...direction(h, humerusM, DOWN),
            ...direction(f, forearmM!, DOWN),
            ...direction(f, forearmM!, FRONT).map((v) => v * 0.5),
            ...rotationVector(humerusM.clone().invert().multiply(h)).map((v) => v * 0.1),
            ...outside(paths, x),
          ];
        })
      : x0;
    paths.forEach((path, i) => (raw[path] = x0[i]));
    set({ [paths[0]]: x[0], [paths[1]]: x[1], [paths[2]]: x[2] });
    if (foreM) set({ [paths[3]]: x[3], [paths[4]]: x[4] });
    if (has(shoulder) && driven(shoulder)) {
      const [a, b] = eulerReadings(girdle, "ZYX");
      set(pick([a, b].map((e) => ({ [`${arm}.scapula_elevation`]: s * e.z - x[1] * CLAVICLE_RISE, [`${arm}.scapula_protraction`]: -s * e.y })), previous));
    }
    if (has(hand) && driven(hand)) {
      // The hand keeps its turn in the world, whatever the forearm above it became.
      const forearm = foreM ? forearmOf(x, humerusOf(x)) : humerusOf(x);
      const measuredWorld = (forearmM ?? humerusM).clone().multiply(target(hand));
      const [a, b] = eulerReadings(forearm.clone().invert().multiply(measuredWorld), "XZY");
      set(pick([a, b].map((e) => ({ [`${arm}.wrist_flexion`]: -e.x, [`${arm}.wrist_deviation`]: s * e.z })), previous));
    }
  }

  for (const [side, s, prefix] of [["left", 1, "Left"], ["right", -1, "Right"]] as const) {
    const leg = `${side}_leg`;
    const thigh = `${prefix}UpLeg` as Logical;
    const shank = `${prefix}Leg` as Logical;
    const foot = `${prefix}Foot` as Logical;
    if (!has(thigh) || !driven(thigh)) continue;
    // Flexion, abduction on the axis it leaves, rotation last.
    const thighM = target(thigh);
    const [a, b] = eulerReadings(thighM, "XZY");
    const hip = pick([a, b].map((e) => ({ [`${leg}.hip_flexion`]: -e.x, [`${leg}.hip_abduction`]: s * e.z, [`${leg}.hip_rotation`]: s * e.y })), previous);
    const paths = [`${leg}.hip_flexion`, `${leg}.hip_abduction`, `${leg}.hip_rotation`, `${leg}.knee_flexion`];
    const shankM = has(shank) && driven(shank) ? target(shank) : null;
    const x0 = [hip[paths[0]], hip[paths[1]], hip[paths[2]], shankM ? unwrapInto(swingTwist(shankM, X).twist, paths[3], before(paths[3])) : 0];
    const thighOf = (x: number[]) => mul(qx(-x[0]), qz(s * x[1]), qy(s * x[2]));
    const shankWorldM = shankM ? thighM.clone().multiply(shankM) : null;
    // Where the toes point: the ankle cannot turn about the shin, so the thigh's turn decides it.
    const toesM = shankWorldM && has(foot) && driven(foot) ? FRONT.clone().applyQuaternion(shankWorldM.clone().multiply(target(foot))) : null;
    // The chain as a whole: the knee and the ankle where the capture had them (a knee is a hinge here,
    // not always there), and the toes as close to their heading as that leaves.
    const x = shankM
      ? fitResidual(x0, (x) => {
          const t = thighOf(x);
          const sh = t.clone().multiply(qx(x[3]));
          const heading = toesM ? headingError(sh, toesM).map((v) => v * 0.5) : [];
          return [...direction(t, thighM, DOWN), ...direction(sh, shankWorldM!, DOWN), ...heading, ...rotationVector(thighM.clone().invert().multiply(t)).map((v) => v * 0.1), ...outside(paths, x)];
        })
      : x0;
    paths.forEach((path, i) => (raw[path] = x0[i]));
    set({ [paths[0]]: x[0], [paths[1]]: x[1], [paths[2]]: x[2] });
    if (shankM) set({ [paths[3]]: x[3] });
    if (has(foot) && driven(foot)) {
      // The foot keeps its turn in the world (a sole flat on the floor stays flat).
      const shankNow = thighOf(x).multiply(qx(shankM ? x[3] : 0));
      const measuredWorld = (shankWorldM ?? thighM).clone().multiply(target(foot));
      const [fa, fb] = eulerReadings(shankNow.clone().invert().multiply(measuredWorld), "XZY");
      set(pick([fa, fb].map((e) => ({ [`${leg}.ankle_dorsiflexion`]: -e.x, [`${leg}.ankle_inversion`]: -s * e.z })), previous));
    }
  }

  // Held to the joint limits, and said.
  const clamped: string[] = [];
  for (const path of ANGLE_PATHS) {
    const v = getPoseValue(pose, path);
    if (v === null) continue;
    const c = clampToLimit(path, v);
    const read = raw[path] !== undefined && clampToLimit(path, raw[path]) !== raw[path] ? raw[path] : v;
    if (Math.abs(c - read) > 0.05) clamped.push(`${path}: ${Math.round(read)} -> ${Math.round(c)}`);
    pose = setPoseValue(pose, path, Number(c.toFixed(3)));
  }

  // How far the pose's bones are from the measured ones, as the eye sees it.
  const back = characterDeltas(pose, rig);
  const mine: Deltas = {};
  const theirs: Deltas = {};
  for (const logical of LOGICAL_BONES) {
    if (!back[logical] || !has(logical) || !driven(logical)) continue;
    mine[logical] = back[logical];
    theirs[logical] = target(logical);
  }
  const residual = bodyDifference(mine, theirs);
  let worst: Logical | null = null;
  let worstAngle = 0;
  for (const logical of Object.keys(mine) as Logical[]) {
    const d = bodyDifference({ [logical]: mine[logical] }, { [logical]: theirs[logical] });
    if (d > worstAngle) [worstAngle, worst] = [d, logical];
  }
  return { pose, clamped, residual, worst };
}

/**
 * PoseAngles from the avatar's bone rotations at one instant: `local` holds each bone's local
 * rotation (bones it lacks keep their rest rotation), `hipsPosition` the pelvis in its parent's units.
 */
export function poseFromBones(rig: Rig, local: Map<string, THREE.Quaternion>, hipsPosition: THREE.Vector3, options: PoseFromBonesOptions = {}): PoseFromBonesResult & { fk: Map<string, WorldTransform> } {
  const fk = forwardKinematics(rig, local, hipsPosition);
  return { ...poseFromDeltas(rig, measuredDeltas(rig, fk), options), fk };
}
