// The pose solver: goals reached and pins turned into angles (resolvePose), then angles to bones, pelvis and contacts (solvePoseCore).
import * as THREE from "three";
import { HIPS_HEIGHT_BY_ORIENTATION, type HeightRef, type PoseAngles } from "./anatomy.ts";
import { LOGICAL, type Logical } from "./pose-bones.ts";
import { characterDeltas } from "./pose-deltas.ts";
import { flattenFeet, keepOffFloor, standOnFeet } from "./pose-floor.ts";
import { flattenHands, reachFeet, reachHands, solveArmsToImplement } from "./pose-ik.ts";
import { solveLimbAngles } from "./pose-limb.ts";
import { buildRig, forwardKinematics, locals } from "./pose-kinematics.ts";
import type { RestPose } from "./rest-pose.ts";
import type { Planted, Rig, SolveContext, Solved } from "./pose-types.ts";

/** A foot further than this from where the first pose planted it has stepped: it is not held there. */
const STEP_M = 0.45;

const KNEE_ABOVE_FLOOR = 0.06;

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
export function resolvePose(given: PoseAngles, rig: Rig, ctx: SolveContext): PoseAngles {
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

export function solvePose(p: PoseAngles, rig: Rig, ctx: SolveContext): Solved {
  return solvePoseCore(resolvePose(p, rig, ctx), rig, ctx);
}

/**
 * Angles → bone rotations, the pelvis and the bar IK. Standing, the feet that carry the body go
 * where they belong (a pin, where the first pose planted them, or where the legs had them when
 * the pelvis was moved by hand) and the legs reach them from the pelvis. Cheap: this runs for
 * every frame of a clip.
 */
export function solvePoseCore(p: PoseAngles, rig: Rig, ctx: SolveContext): Solved {
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
      if (p.free_foot && !ctx.trial) keepOffFloor(rig, local, hipsPosition, p.free_foot);
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
