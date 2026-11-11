import * as THREE from "three";
import { clampToLimit, getPoseValue, setPoseValue, type PoseAngles } from "./anatomy.ts";
import { characterDeltas, localFor, type Logical, type Rig, type WorldTransform } from "./pose-clip.ts";
import { ROM } from "./rom.ts";
import type { PointId } from "./pose-points.ts";

/**
 * Angle-space reach for the pose editor's body points: moves a hand, elbow, foot, knee, the chest
 * or the head towards a world point by searching only the joint angles that honestly move it,
 * each kept inside its range of motion. The result is an ordinary pose, so the sliders show it.
 */

export type Reach = {
  /** Skeleton bones the angles turn, parent first, down to the bone that carries the point. */
  chain: string[];
  /** Logical name of each chain bone (for its rotation in the pose). */
  logicals: Logical[];
  /** Pose fields searched. */
  dofs: string[];
  /** Index in `chain` of the bone carrying the point. */
  at: number;
  /** Offset of the point from that bone's origin, in the bone's own world frame at rest (metres). */
  offset: THREE.Vector3 | null;
  /**
   * How the free joints settle once the point is reached: a chain joint kept low, an angle kept
   * near zero, angles that only move when the others cannot reach (kept where they started), or
   * the segment below the point kept pointing where it did (a shank hangs under a lifted knee).
   */
  prefer?: { low?: number; zero?: number; still?: number[]; hang?: boolean };
  /** The angles a stuck search may turn by itself (see escapeSaddle); all of them when absent. */
  escape?: number[];
};

/**
 * Where a candidate pose puts the point, the chain joints above it and, when known, the joint
 * below it; `sink` is how far it pushes the limb through the floor (metres), which no drag may ask.
 */
export type Placed = { point: THREE.Vector3; joints: THREE.Vector3[]; tail?: THREE.Vector3; sink?: number };

/**
 * A drag stays inside the normal training range of each joint (rom.ts), which is never wider than
 * its hard range: the body checks then have nothing to warn about. A slider can still go further
 * on purpose.
 */
export function clampForDrag(path: string, value: number): number {
  const [section, field] = path.split(".");
  const group = section.replace(/^(left|right)_/, "");
  const training = ROM[`${group}.${field}`]?.training;
  const hard = clampToLimit(path, value);
  return training ? Math.min(training[1], Math.max(training[0], hard)) : hard;
}

const ARM_DOFS = (s: "left" | "right") => [`${s}_arm.shoulder_elevation`, `${s}_arm.shoulder_plane`, `${s}_arm.shoulder_rotation`, `${s}_arm.elbow_flexion`];
const LEG_DOFS = (s: "left" | "right") => [`${s}_leg.hip_flexion`, `${s}_leg.hip_abduction`, `${s}_leg.hip_rotation`, `${s}_leg.knee_flexion`];

/** The head point sits in the middle of the skull, not at the joint at its base: from the head's highest child, else a fixed 11 cm. */
export function headOffset(rig: Rig): THREE.Vector3 | null {
  const head = rig.names.Head;
  const rest = head ? rig.rest.get(head) : undefined;
  if (!head || !rest) return null;
  let top: THREE.Vector3 | null = null;
  for (const [, r] of rig.rest) if (r.parent === head && (!top || r.worldPosition.y > top.y)) top = r.worldPosition;
  const world = top ? top.clone().sub(rest.worldPosition).multiplyScalar(0.5) : new THREE.Vector3(0, 0.11 * (rig.hipsRestY / 0.95), 0);
  if (world.lengthSq() < 1e-6) world.set(0, 0.11 * (rig.hipsRestY / 0.95), 0);
  return world.applyQuaternion(rest.world.clone().invert());
}

/** How a point is driven on this rig, or null when the rig cannot move it (no such bones). */
export function reachFor(rig: Rig, id: PointId): Reach | null {
  const build = (logicals: Logical[], dofs: string[], atLogical: Logical, offset: THREE.Vector3 | null = null): Reach | null => {
    const present = logicals.filter((l) => rig.names[l] && rig.rest.has(rig.names[l]!));
    const at = present.indexOf(atLogical);
    if (at < 0 || present.length < 2) return null;
    return { chain: present.map((l) => rig.names[l]!), logicals: present, dofs, at, offset };
  };
  const side = id.startsWith("left_") ? "left" : "right";
  const S = side === "left" ? "Left" : "Right";
  switch (id) {
    case "left_hand":
    case "right_hand": {
      // The elbow hangs: of all the ways to put the hand there, the one with the elbow lowest.
      const r = build([`${S}Shoulder`, `${S}Arm`, `${S}ForeArm`, `${S}Hand`], ARM_DOFS(side), `${S}Hand`);
      return r && { ...r, prefer: { low: r.logicals.indexOf(`${S}ForeArm`) } };
    }
    case "left_elbow":
    case "right_elbow":
      return build([`${S}Shoulder`, `${S}Arm`, `${S}ForeArm`], ARM_DOFS(side).slice(0, 3), `${S}ForeArm`);
    case "left_foot":
    case "right_foot": {
      // The thigh does not twist more than it must: the knee keeps pointing where the foot does.
      // A leg that cannot get there by itself lifts forwards or bends, it does not swing out to the side.
      const r = build([`${S}UpLeg`, `${S}Leg`, `${S}Foot`], LEG_DOFS(side), `${S}Foot`);
      return r && { ...r, prefer: { zero: 2 }, escape: [0, 3] };
    }
    case "left_knee":
    case "right_knee": {
      // The thigh carries the knee; the knee bends only so that the shank keeps hanging as it did.
      const r = build([`${S}UpLeg`, `${S}Leg`], LEG_DOFS(side), `${S}Leg`);
      return r && { ...r, prefer: { zero: 2, hang: true }, escape: [0] };
    }
    case "chest": {
      // The chest point is the top of the thorax (the base of the neck): the lumbar and thoracic
      // bends carry it, with the whole length of the spine as their lever.
      const dofs = ["lumbar.flexion", "lumbar.lateral", "thoracic.flexion", "thoracic.lateral"];
      if (rig.names.Neck) return build([...rig.spine, "Neck"], dofs, "Neck");
      return rig.spine.length >= 2 ? build([...rig.spine], dofs, rig.spine[rig.spine.length - 1]) : null;
    }
    case "head": {
      // The neck tilts and nods the head (it does not turn it: a turn barely moves the point and
      // only twists the neck); the spine bends with it, as little as it can, so the point follows
      // the pointer farther than the few centimetres a head alone can go.
      const head = ["head.pitch", "head.lateral"];
      const spine = ["lumbar.flexion", "lumbar.lateral", "thoracic.flexion", "thoracic.lateral"];
      const r = rig.spine.length >= 1 ? build([...rig.spine, "Neck", "Head"], [...head, ...spine], "Head", headOffset(rig)) : null;
      if (r) return { ...r, prefer: { still: spine.map((_, i) => head.length + i) } };
      return build(["Neck", "Head"], head, "Head", headOffset(rig));
    }
    case "hips":
      return null; // the pelvis is moved by its height and forward offset, not by angles (see pose-drag)
  }
}

/** World transform of the parent of a chain's first bone, from the body as solved. */
function chainParent(rig: Rig, fk: Map<string, WorldTransform>, first: string): WorldTransform {
  const r = rig.rest.get(first)!;
  const parent = r.parent ? fk.get(r.parent) : undefined;
  if (parent) return parent;
  const pq = rig.parentWorld.get(first) ?? new THREE.Quaternion();
  return { pos: r.worldPosition.clone().sub(r.position.clone().multiplyScalar(r.parentWorldScale).applyQuaternion(pq)), quat: pq };
}

/** Where the point is for these angles, with the rest of the body as `fk` has it. */
export function reachPosition(rig: Rig, fk: Map<string, WorldTransform>, pose: PoseAngles, reach: Reach): THREE.Vector3 {
  return reachJoints(rig, fk, pose, reach).point;
}

/** The point and every chain joint (world) for these angles, the rest of the body staying as `fk` has it. */
export function reachJoints(rig: Rig, fk: Map<string, WorldTransform>, pose: PoseAngles, reach: Reach): Placed {
  const joints: THREE.Vector3[] = [];
  const deltas = characterDeltas(pose, rig);
  const computed = new Map<string, WorldTransform>();
  let last = chainParent(rig, fk, reach.chain[0]);
  for (let i = 0; i <= reach.at; i += 1) {
    const name = reach.chain[i];
    const r = rig.rest.get(name)!;
    const parent = i === 0 || !r.parent ? last : (computed.get(r.parent) ?? fk.get(r.parent) ?? last);
    const local = localFor(rig, name, deltas[reach.logicals[i]] ?? new THREE.Quaternion());
    last = {
      pos: parent.pos.clone().add(r.position.clone().multiplyScalar(r.parentWorldScale).applyQuaternion(parent.quat)),
      quat: parent.quat.clone().multiply(local),
    };
    computed.set(name, last);
    joints.push(last.pos);
  }
  return { point: reach.offset ? last.pos.clone().add(reach.offset.clone().applyQuaternion(last.quat)) : last.pos.clone(), joints };
}

/** Damping of the least-squares step: the larger, the smaller and steadier each step. */
const DAMPING = 0.0015;
/** Largest change of one joint in one iteration, degrees. */
const MAX_STEP = 12;
const PROBE = 0.25;

/**
 * What a drag asks, in priority order. First, exactly: the point on the pointer's ray (with a view
 * direction) or at the target (keys, the axis gizmo), and nothing through the floor (`floor`, where
 * the candidate's place says how far it sinks). Then, only with the joints that are still
 * free: stay near the depth it was grabbed at (`depth`), and settle the natural way (`low`: an
 * elbow hangs; `zero`: a thigh does not twist, per degree; `still`: the spine stays as it was
 * under a dragged head, per degree; `hang`: the shank keeps its direction under a dragged knee).
 * The second set never moves the point off the pointer.
 */
const WEIGHT = { depth: 0.2, low: 1, zero: 0.004, still: 0.004, hang: 0.5, floor: 3 } as const;

/**
 * Limits that join two angles, as the body validator checks them (pose-validate.ts): behind the
 * body (plane under -45°) the shoulder stops at 80° of elevation.
 */
export function keepCoupled(dofs: string[], values: number[]): number[] {
  const plane = dofs.findIndex((d) => d.endsWith(".shoulder_plane"));
  const elevation = dofs.findIndex((d) => d.endsWith(".shoulder_elevation"));
  if (plane < 0 || elevation < 0 || values[plane] >= -45 || values[elevation] <= 80) return values;
  const out = [...values];
  out[elevation] = 80;
  return out;
}

/** Solves the small system A x = b (A symmetric positive definite) by Gaussian elimination. */
export function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    if (Math.abs(m[c][c]) < 1e-18) return new Array(n).fill(0);
    for (let r = c + 1; r < n; r += 1) {
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k += 1) m[r][k] -= f * m[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let sum = m[r][n];
    for (let k = r + 1; k < n; k += 1) sum -= m[r][k] * x[k];
    x[r] = sum / m[r][r];
  }
  return x;
}

export type ReachOptions = {
  /** Unit view direction of the camera: the depth along it is soft (a pointer drag). */
  view?: THREE.Vector3;
  /**
   * With `view`: what leaving the depth the point was grabbed at costs next to leaving the pointer
   * (0 to 1), asked together with it. Absent, the depth is free: only a preference (see WEIGHT).
   */
  depth?: number;
  /**
   * Where a candidate pose puts the point when the rest of the body does not stay as it was: the
   * legs, whose feet carry the pelvis (see pose-legs.ts). Default: the chain alone (`reachJoints`).
   */
  place?: (pose: PoseAngles) => Placed;
};

/**
 * Prioritised damped least squares over the reach's angles, each clamped to its range of motion.
 * Each step is the smallest change of all the joints together that meets the first asks (see
 * WEIGHT), plus whatever of the second asks fits in the joints that leaves free: a hip and a knee
 * lift a foot forward and up, which neither does alone, an arm reaches with its elbow down, and
 * the small moves of a drag stay small and smooth. A joint held at its limit drops out of the step
 * and the others take over.
 */
export function reachPose(rig: Rig, fk: Map<string, WorldTransform>, given: PoseAngles, reach: Reach, target: THREE.Vector3, options: ReachOptions = {}): PoseAngles {
  const pose = seedHinge(rig, fk, seedArmPlane(rig, fk, given, reach, target), reach, target);
  const start = reach.dofs.map((d) => getPoseValue(pose, d) ?? 0);
  const posed = (vals: number[]) => vals.reduce((p, v, i) => setPoseValue(p, reach.dofs[i], v), pose);
  const view = options.view?.clone().normalize();
  const axes = view
    ? (() => {
        const u = new THREE.Vector3().crossVectors(view, Math.abs(view.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
        return [u, new THREE.Vector3().crossVectors(view, u).normalize(), view];
      })()
    : [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const depth = view && options.depth === undefined ? WEIGHT.depth : (options.depth ?? 1);
  const soft = Boolean(view && options.depth === undefined); // the depth is only a preference
  const prefer = reach.prefer ?? {};
  const place = options.place ?? ((p: PoseAngles) => reachJoints(rig, fk, p, reach));
  const before = place(pose);
  const low = prefer.low;
  const lowest = low !== undefined ? before.joints[low - 1].y - before.joints[low - 1].distanceTo(before.joints[low]) : 0;
  const hanging = (at: Placed) => (prefer.hang && at.tail ? at.tail.clone().sub(at.point).normalize() : null);
  const hung = hanging(before);
  const grounded = before.sink !== undefined;
  const first = (soft ? 2 : 3) + (grounded ? 1 : 0); // rows asked first; the rest only in what they leave free
  const rowsOf = (vals: number[]): number[] => {
    const at = place(posed(vals));
    const e = target.clone().sub(at.point);
    const asked = axes.map((axis, i) => e.dot(axis) * (i < 2 ? 1 : depth));
    const rows = soft ? asked.slice(0, 2) : asked;
    if (grounded) rows.push(-(at.sink ?? 0) * WEIGHT.floor);
    if (soft) rows.push(asked[2]);
    if (low !== undefined) rows.push((lowest - at.joints[low].y) * WEIGHT.low);
    for (const i of prefer.still ?? []) rows.push((start[i] - vals[i]) * WEIGHT.still);
    if (prefer.zero !== undefined) rows.push(-vals[prefer.zero] * WEIGHT.zero);
    const now = hung && hanging(at);
    if (hung && now) rows.push(...hung.clone().sub(now).multiplyScalar(WEIGHT.hang).toArray());
    return rows;
  };
  const split = (rows: number[]) => [norm2(rows.slice(0, first)), norm2(rows.slice(first))] as const;
  const better = (a: readonly [number, number], b: readonly [number, number]) => a[0] < b[0] - 1e-10 || (a[0] <= Math.max(b[0], 1e-8) + 1e-10 && a[1] < b[1] - 1e-10);

  const search = (initial: number[]) => {
    let values = keepCoupled(reach.dofs, [...initial]);
    let rows = rowsOf(values);
    let cost = split(rows);
    for (let iter = 0; iter < 40; iter += 1) {
      // Jacobian of the rows (row units per degree), one-sided differences into the range.
      const columns = values.map((v, i) => {
        const max = clampForDrag(reach.dofs[i], 1e9);
        const min = clampForDrag(reach.dofs[i], -1e9);
        const h = v + PROBE <= max ? PROBE : -PROBE;
        if (v + h < min) return rows.map(() => 0);
        const trial = [...values];
        trial[i] = v + h;
        return rowsOf(trial).map((r, k) => -(r - rows[k]) / h);
      });
      let locked = new Set<number>();
      let next = values;
      for (let pass = 0; pass < 2; pass += 1) {
        const free = columns.map((c, i) => (locked.has(i) ? c.map(() => 0) : c));
        const step = prioritisedStep(free, rows, first);
        const limit = Math.min(1, MAX_STEP / Math.max(1e-9, ...step.map(Math.abs)));
        next = keepCoupled(reach.dofs, values.map((v, i) => clampForDrag(reach.dofs[i], v + step[i] * limit)));
        // A joint the limit stopped drops out, and the step is taken again without it.
        const stopped = new Set(next.flatMap((v, i) => (Math.abs(v - (values[i] + step[i] * limit)) > 1e-6 ? [i] : [])));
        if (!stopped.size || [...stopped].every((i) => locked.has(i))) break;
        locked = new Set([...locked, ...stopped]);
      }
      let moved = rowsOf(next);
      let c = split(moved);
      // A step that overshoots is halved until it helps.
      for (let k = 0; k < 4 && !better(c, cost); k += 1) {
        next = values.map((v, i) => v + (next[i] - v) / 2);
        moved = rowsOf(next);
        c = split(moved);
      }
      if (!better(c, cost)) {
        // No first-order way forward: a straight spine pulled straight down, a straight limb pulled
        // along itself. Try a few real turns of each joint and keep the best, then go on.
        const escape = cost[0] > 1e-7 ? escapeSaddle(reach, values, (vals) => norm2(rowsOf(vals).slice(0, first)), cost[0]) : null;
        if (!escape) break;
        next = escape.values;
        moved = rowsOf(next);
        c = split(moved);
      }
      // Reached, and the joints have settled: further steps would change nothing visible.
      const settled = c[0] < CONVERGED_M ** 2 && cost[0] < CONVERGED_M ** 2 && cost[1] - c[1] < 1e-3 * Math.max(cost[1], 1e-12) + 1e-14;
      values = next;
      rows = moved;
      cost = c;
      if (settled) break;
    }
    return { values, cost };
  };
  const { values } = search(start);
  let out = pose;
  values.forEach((v, i) => {
    const rounded = Math.round(v * 100) / 100;
    if (rounded !== start[i]) out = setPoseValue(out, reach.dofs[i], rounded);
  });
  return out;
}

/** Below this error (metres) a search stops once its preferences stop improving. */
const CONVERGED_M = 0.0003;

const norm2 = (rows: number[]) => rows.reduce((sum, r) => sum + r * r, 0);

/** Damped pseudo-inverse step x = Jᵀ (J Jᵀ + λ² I)⁻¹ e, for J given by its columns (one per joint) restricted to `rows`. */
function dampedStep(columns: number[][], e: number[], rows: number[]): number[] {
  const a = rows.map((r, ri) => rows.map((k, ki) => (ri === ki ? DAMPING ** 2 : 0) + columns.reduce((sum, c) => sum + c[r] * c[k], 0)));
  const y = solve(a, rows.map((r) => e[r]));
  return columns.map((c) => rows.reduce((sum, r, ri) => sum + c[r] * y[ri], 0));
}

/**
 * Two-level step: the first rows exactly (damped), then the other rows only within the null space
 * the first leave, so they never pull the point off its target.
 */
function prioritisedStep(columns: number[][], e: number[], first: number): number[] {
  const all = e.map((_, i) => i);
  const primary = all.slice(0, first);
  const secondary = all.slice(first);
  const d1 = dampedStep(columns, e, primary);
  if (!secondary.length) return d1;
  // Null-space projector N = I - J1⁺ J1, built column by column from unit joint steps.
  const nj = columns.length;
  const project = (v: number[]) => {
    const jv = primary.map((r) => columns.reduce((sum, c, i) => sum + c[r] * v[i], 0));
    const back = dampedStep(columns, Object.assign(new Array(e.length).fill(0), Object.fromEntries(primary.map((r, k) => [r, jv[k]]))), primary);
    return v.map((x, i) => x - back[i]);
  };
  const basis = Array.from({ length: nj }, (_, i) => project(Array.from({ length: nj }, (_, k) => (k === i ? 1 : 0))));
  // Secondary rows through the projector: columns of J2 N.
  const projected = basis.map((_, i) => e.map((__, r) => (r < first ? 0 : basis.reduce((sum, b, k) => sum + columns[k][r] * b[i], 0))));
  // What is left of the secondary asks after the primary step.
  const left = e.map((v, r) => (r < first ? 0 : v - columns.reduce((sum, c, i) => sum + c[r] * d1[i], 0)));
  const d2 = dampedStep(projected, left, secondary);
  const nd2 = basis.map((_, i) => basis.reduce((sum, b, k) => sum + b[i] * d2[k], 0));
  return d1.map((v, i) => v + nd2[i]);
}

/** The best single-joint turn of a few sizes that lowers the cost, or null. Ties keep the first (positive) direction. */
function escapeSaddle(reach: Reach, values: number[], costOf: (vals: number[]) => number, cost: number): { values: number[]; cost: number } | null {
  let best = null as { values: number[]; cost: number } | null;
  for (const size of [4, 10, 20]) {
    for (const i of reach.escape ?? values.map((_, k) => k)) {
      for (const sign of [1, -1]) {
        const trial = [...values];
        trial[i] = clampForDrag(reach.dofs[i], values[i] + sign * size);
        const fixed = keepCoupled(reach.dofs, trial);
        const c = costOf(fixed);
        if (c < (best?.cost ?? cost - 1e-9)) best = { values: fixed, cost: c };
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * How far a hand or foot is from its shoulder or hip decides how much the elbow or knee bends (the
 * law of cosines on the two segments). A straight limb, where moving towards or away from the root
 * is impossible to first order, is bent towards that first instead of getting stuck.
 */
function seedHinge(rig: Rig, fk: Map<string, WorldTransform>, pose: PoseAngles, reach: Reach, target: THREE.Vector3): PoseAngles {
  const hinge = reach.dofs.find((d) => d.endsWith(".elbow_flexion") || d.endsWith(".knee_flexion"));
  if (!hinge || reach.prefer?.hang) return pose; // a dragged knee does not decide how much it bends
  const limb = hinge.split(".")[0];
  const S = limb.startsWith("left_") ? "Left" : "Right";
  const [root, mid, end] = (limb.endsWith("_arm") ? [`${S}Arm`, `${S}ForeArm`, `${S}Hand`] : [`${S}UpLeg`, `${S}Leg`, `${S}Foot`]) as Logical[];
  const at = (l: Logical) => (rig.names[l] ? rig.rest.get(rig.names[l]!)?.worldPosition : undefined);
  const r = at(root), m = at(mid), e = at(end);
  const from = rig.names[root] ? fk.get(rig.names[root]!)?.pos : undefined;
  if (!r || !m || !e || !from) return pose;
  const l1 = r.distanceTo(m);
  const l2 = m.distanceTo(e);
  const d = THREE.MathUtils.clamp(target.distanceTo(from), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const inner = Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  const bend = THREE.MathUtils.radToDeg(Math.PI - inner);
  // Only a straight limb needs it (elsewhere the search bends it as it goes), and only part of the
  // way: the target's depth may still change, so the search finishes the bend.
  if ((getPoseValue(pose, hinge) ?? 0) > 10) return pose;
  return setPoseValue(pose, hinge, clampForDrag(hinge, Math.round(Math.min(bend, 60) * 100) / 100));
}

/**
 * An arm hanging down has no plane of elevation yet: turning the plane moves nothing, so a search
 * started there could only swing the arm out to the side. Point the plane where the target is
 * first (a free choice while the arm hangs), and the elevation then lifts it towards the target.
 */
function seedArmPlane(rig: Rig, fk: Map<string, WorldTransform>, pose: PoseAngles, reach: Reach, target: THREE.Vector3): PoseAngles {
  const elevation = reach.dofs.find((d) => d.endsWith(".shoulder_elevation"));
  const plane = reach.dofs.find((d) => d.endsWith(".shoulder_plane"));
  if (!elevation || !plane || Math.abs(getPoseValue(pose, elevation) ?? 0) > 3) return pose;
  const side = plane.startsWith("left_") ? 1 : -1;
  const arm = rig.names[side === 1 ? "LeftArm" : "RightArm"];
  const parentName = arm ? rig.rest.get(arm)?.parent : null;
  const parent = parentName ? fk.get(parentName) : undefined;
  const shoulder = arm ? fk.get(arm)?.pos : undefined;
  if (!parentName || !parent || !shoulder) return pose;
  // Into the character frame: undo what the trunk's turn did to the anatomical position.
  const turn = parent.quat.clone().multiply((rig.anatomical.get(parentName) ?? new THREE.Quaternion()).clone().invert());
  const v = target.clone().sub(shoulder).applyQuaternion(turn.invert());
  if (Math.hypot(v.x, v.z) < 0.03) return pose;
  const degrees = THREE.MathUtils.radToDeg(Math.atan2(v.z, side * v.x));
  return setPoseValue(pose, plane, clampForDrag(plane, Math.round(degrees)));
}
