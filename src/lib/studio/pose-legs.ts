import * as THREE from "three";
import { clampToLimit, flatAnkle, getPoseValue, setPoseValue, type PoseAngles } from "./anatomy.ts";
import type { SolveContext } from "./pose-clip.ts";
import type { PointId } from "./pose-points.ts";
import { clampForDrag, reachJoints, solve, type Placed, type ReachOptions } from "./pose-reach.ts";
import type { HeldSolve, PoseSession } from "./pose-session.ts";

/**
 * How a leg is dragged. Standing, the feet carry the pelvis, so a leg is not a limb hanging from a
 * still body: the body is asked where a candidate pose puts the point (`bodyPlace`), a standing
 * body moves one leg at a time (`movesAlone`: nobody lifts both feet), and the leg being moved
 * stops carrying the body whenever that leaves the body where it is (`legStart`), so the rest stays
 * still under the drag. Put back where it stood, the foot carries the body again (`settleLeg`).
 */

export type Side = "left" | "right";

/** The leg a point belongs to (knee or foot), or null. */
export function legOf(id: PointId): Side | null {
  if (!id.endsWith("_knee") && !id.endsWith("_foot")) return null;
  return id.startsWith("left_") ? "left" : "right";
}

/** A leg of a standing body moves alone: Mirror would lift both feet and drop the body on the floor. */
export function movesAlone(pose: PoseAngles, id: PointId): boolean {
  return legOf(id) !== null && pose.orientation === "standing";
}

/**
 * The drawn body may shift this much (metres: across the floor, up or down) when a foot starts or
 * stops carrying it, and count as still; more across the floor when the two feet swap who carries
 * (`swap`). The leg in hand may shift more (`own`): it goes to the pointer anyway.
 */
const STILL_M = { across: 0.004, swap: 0.06, height: 0.02, own: 0.05 } as const;
/** A foot whose ankle is within this of its height on the floor is on the floor (metres). */
const ON_FLOOR_M = 0.03;
/**
 * A free foot keeps its sole level up to the first height above the floor, and has let go of it by
 * the second (metres). Well above `ON_FLOOR_M`: a foot whose ankle cannot bend enough to lie level
 * is lifted a little so its toes clear the floor, and must not lose its level sole for that.
 */
const SOLE_LEVEL_M = [0.08, 0.14] as const;

/**
 * The context to try candidates of `pose` in. The first pose of a clip is the stance the others
 * are planted on, and is told apart by being that very object: a candidate that would replace it
 * is its own stance too, not a later pose held to the old one.
 */
export function trialContext(ctx: SolveContext, pose: PoseAngles): SolveContext {
  return ctx.stance === pose ? { ...ctx, stance: undefined } : ctx;
}

function still(session: PoseSession, pose: PoseAngles, ctx: SolveContext, drawn: Partial<Record<PointId, THREE.Vector3>>, side: Side, across: number = STILL_M.across): boolean {
  const ids = session.available;
  const at = session.probe(pose, ctx, ids).points;
  return ids.every((id, i) => {
    const [a, b] = [at[i], drawn[id]];
    if (!a || !b) return true;
    if (legOf(id) === side) return a.distanceTo(b) < STILL_M.own;
    return Math.hypot(a.x - b.x, a.z - b.z) < across && Math.abs(a.y - b.y) < STILL_M.height;
  });
}

/**
 * The leg's own angles for the leg as drawn. Where the solver placed a leg from the pelvis to a
 * foot it holds (a pelvis lowered by hand, a later pose of a clip), the pose's angles do not say
 * how the leg is bent: a least-squares fit of the hip and knee angles to the drawn knee and ankle,
 * inside the range a drag keeps to. The pose as given when the angles already draw it, or cannot.
 */
export function legAsDrawn(session: PoseSession, solved: HeldSolve, pose: PoseAngles, side: Side): PoseAngles {
  const { rig } = session;
  const reach = session.reach(`${side}_foot`);
  const pelvis = rig.names.Hips ? solved.fk.get(rig.names.Hips) : undefined;
  const drawn = [solved.points[`${side}_knee`], solved.points[`${side}_foot`]];
  if (!reach || !pelvis || !drawn[0] || !drawn[1]) return pose;
  const residual = (p: PoseAngles) => {
    const at = reachJoints(rig, solved.fk, p, reach);
    return [at.joints[at.joints.length - 2], at.point].flatMap((joint, i) => joint.clone().sub(drawn[i]!).toArray());
  };
  const size = (rows: number[]) => Math.sqrt(rows.reduce((sum, r) => sum + r * r, 0));
  if (size(residual(pose)) < FIT_M) return pose;

  // Start from what the drawn leg says outright: the thigh's direction and the bend of the knee.
  const hip = reachJoints(rig, solved.fk, pose, reach).joints[0];
  const turned = pelvis.quat.clone().multiply(rig.anatomical.get(rig.names.Hips!)!.clone().invert());
  const axis = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(turned);
  const thigh = drawn[0].clone().sub(hip).normalize();
  const shank = drawn[1].clone().sub(drawn[0]).normalize();
  const degrees = THREE.MathUtils.radToDeg;
  const start: Record<string, number> = {
    hip_flexion: degrees(Math.atan2(thigh.dot(axis(0, 0, 1)), thigh.dot(axis(0, -1, 0)))),
    hip_abduction: degrees(Math.asin(THREE.MathUtils.clamp(thigh.dot(axis(side === "left" ? 1 : -1, 0, 0)), -1, 1))),
    hip_rotation: 0,
    knee_flexion: degrees(thigh.angleTo(shank)),
  };
  const dofs = reach.dofs;
  const posed = (values: number[]) => values.reduce((p, v, i) => setPoseValue(p, dofs[i], clampForDrag(dofs[i], v)), pose);
  let values = dofs.map((d) => clampForDrag(d, start[d.split(".")[1]] ?? getPoseValue(pose, d) ?? 0));
  let rows = residual(posed(values));
  for (let iter = 0; iter < 24 && size(rows) > FIT_M / 4; iter += 1) {
    const columns = values.map((v, i) => {
      const trial = [...values];
      trial[i] = v + 0.25;
      return residual(posed(trial)).map((r, k) => (r - rows[k]) / 0.25);
    });
    const normal = columns.map((a, i) => columns.map((b, k) => a.reduce((sum, x, r) => sum + x * b[r], 0) + (i === k ? 1e-8 : 0)));
    const step = solve(normal, columns.map((a) => -a.reduce((sum, x, r) => sum + x * rows[r], 0)));
    const scale = Math.min(1, 15 / Math.max(1e-9, ...step.map(Math.abs)));
    const next = values.map((v, i) => clampForDrag(dofs[i], v + step[i] * scale));
    const moved = residual(posed(next));
    if (size(moved) >= size(rows)) break;
    [values, rows] = [next, moved];
  }
  return size(rows) < FIT_M * 5 ? posed(values.map((v) => Math.round(v * 100) / 100)) : pose;
}

/** A leg drawn within this of where its angles put it (metres, knee and ankle together) is drawn by its angles. */
const FIT_M = 0.002;

/** How a drag of a standing body's leg starts: the pose to move from, and whether this leg alone holds the body up. */
export type LegStart = { pose: PoseAngles; holds: boolean };

/**
 * Where a drag of a standing body's leg starts from. The leg comes free of the body's weight when
 * the body as drawn stays where it is without it: the other foot then holds the body by itself and
 * nothing else moves under the drag. The freed leg takes the angles it is drawn with and its sole
 * stays level on the floor. When the other foot is the free one and rests on the floor, the two
 * swap (the body may settle a little). Otherwise the pose as given: both feet carry on (a split
 * stance), or this leg alone holds the body (`holds`: the other foot is in the air).
 */
export function legStart(session: PoseSession, pose: PoseAngles, ctx: SolveContext, side: Side, solved: HeldSolve): LegStart {
  if (pose.orientation !== "standing" || pose.free_foot === side) return { pose, holds: false };
  const other: Side = side === "left" ? "right" : "left";
  const [own, up] = [footHeight(session, solved, side), footHeight(session, solved, other)];
  if (own === null || up === null) return { pose, holds: false };
  const resting = up < ON_FLOOR_M;
  if (!resting && own < ON_FLOOR_M) return { pose, holds: true };
  const freed = levelSole({ ...legAsDrawn(session, solved, pose, side), free_foot: side }, side, own);
  if (still(session, freed, trialContext(ctx, pose), solved.points, side, pose.free_foot === other ? STILL_M.swap : STILL_M.across)) return { pose: freed, holds: false };
  return { pose, holds: pose.free_foot === other };
}

/** Does this leg alone hold a standing body up as drawn (the other foot is free or in the air)? Its foot cannot be dragged from under the body. */
export function holdsBody(session: PoseSession, pose: PoseAngles, ctx: SolveContext, id: PointId): boolean {
  const side = legOf(id);
  return side !== null && legStart(session, pose, ctx, side, session.solve(pose, ctx)).holds;
}

/** What to tell the person dragging this point about how a standing body's leg moves, in a few words (`moves`: whether the point can move at all); null when there is nothing to say. */
export function legNote(session: PoseSession, pose: PoseAngles, ctx: SolveContext, id: PointId, mirror: boolean): { text: string; moves: boolean } | null {
  if (!movesAlone(pose, id)) return null;
  if (holdsBody(session, pose, ctx, id)) {
    return id.endsWith("_foot") ? { text: "holds the body up: put the other foot down first", moves: false } : { text: "the body rides on this leg", moves: true };
  }
  return mirror ? { text: "standing, one leg at a time", moves: true } : null;
}

/** The ankle above its place on the floor as drawn (metres), or null on a rig without that foot. */
function footHeight(session: PoseSession, solved: HeldSolve, side: Side): number | null {
  const foot = session.rig.feet.find((f) => f.side === side);
  const ankle = solved.points[`${side}_foot`];
  return foot && ankle ? ankle.y - foot.ankleRestY : null;
}

/** After a drag: a free foot back on the floor where it stood carries the body again, when the body stays as drawn. */
export function settleLeg(session: PoseSession, pose: PoseAngles, ctx: SolveContext, side: Side): PoseAngles {
  if (pose.orientation !== "standing" || pose.free_foot !== side) return pose;
  const solved = session.solve(pose, ctx);
  const height = footHeight(session, solved, side);
  if (height === null || height > ON_FLOOR_M) return pose;
  const { free_foot: _free, ...planted } = pose;
  return still(session, planted, trialContext(ctx, pose), solved.points, side) ? planted : pose;
}

/**
 * A free foot near the floor keeps its sole level with it (the solver only does that for the feet
 * that carry the body), fading out as it lifts: slid along the floor, its toes do not dig in.
 * `height` is the ankle above its place on the floor (metres). Returns the pose to try or draw.
 */
export function levelSole(pose: PoseAngles, side: Side, height: number): PoseAngles {
  const near = THREE.MathUtils.clamp(1 - (height - SOLE_LEVEL_M[0]) / (SOLE_LEVEL_M[1] - SOLE_LEVEL_M[0]), 0, 1);
  if (pose.free_foot !== side || near === 0) return pose;
  const path = `${side}_leg.ankle_dorsiflexion`;
  return setPoseValue(pose, path, clampToLimit(path, Math.round(flatAnkle(pose, side) * near * 100) / 100));
}

/**
 * Where the whole body puts a leg point (and the foot under a knee) for a candidate pose, and how
 * far that pushes the foot of a standing body through the floor; `shape` finishes the candidate
 * first. `ctx` is the context to try candidates in (see trialContext).
 */
export function bodyPlace(session: PoseSession, ctx: SolveContext, id: PointId, shape: (pose: PoseAngles) => PoseAngles = (p) => p): (pose: PoseAngles) => Placed {
  const side = legOf(id)!;
  const ids: PointId[] = id.endsWith("_knee") ? [id, `${side}_foot`] : [id];
  const foot = session.rig.feet.find((f) => f.side === side);
  const soles: [string, number][] = foot ? [[foot.name, foot.ankleRestY], [foot.tip, foot.tipRestY], ...(foot.toe ? [[foot.toe, foot.toeRestY] as [string, number]] : [])] : [];
  const trial: SolveContext = { ...ctx, trial: true };
  return (pose) => {
    const candidate = shape(pose);
    const { points, fk } = session.probe(candidate, trial, ids, soles.map(([bone]) => bone));
    const sink = candidate.orientation === "standing" ? Math.max(0, ...soles.map(([bone, floor]) => floor - (fk.get(bone)?.pos.y ?? floor))) : 0;
    return { point: points[0]!, joints: [], tail: points[1], sink };
  };
}

/** Places on the knee's sphere within this of the best (metres off the pointer, squared) count as equally good. */
const ELSEWHERE = 1e-5;
/** How sideways-on the view must be (0 to 1) before leaving the grab depth starts to cost, and where it costs as much as leaving the pointer. */
const SIDE_ON = [0.7, 0.95] as const;

/**
 * Where a pointer drag sends a leg point. Seen from the front or three-quarter on, the depth is
 * free: a leg dragged up comes up towards the viewer and stays under the pointer. Seen side-on the
 * same freedom would swing it out sideways, where the viewer cannot see it, just to stay under the
 * pointer: there the depth counts as much as the pointer and the leg stays in its plane (the
 * thigh points at the pointer). A knee only has the part of a sphere its thigh can draw, so its
 * place there is chosen outright, the cheapest of all the thigh's directions: seen in perspective
 * the way there first looks like going the wrong way, and a step-by-step search would stall.
 */
export function legAim(session: PoseSession, solved: HeldSolve, id: PointId, target: THREE.Vector3, view: THREE.Vector3 | undefined, swings = true): { target: THREE.Vector3; options: ReachOptions } {
  const side = legOf(id);
  const { rig } = session;
  const pelvis = rig.names.Hips ? solved.fk.get(rig.names.Hips) : undefined;
  if (!side || !view || !pelvis) return { target, options: { view } };
  const turned = pelvis.quat.clone().multiply(rig.anatomical.get(rig.names.Hips!)!.clone().invert());
  const outward = new THREE.Vector3(side === "left" ? 1 : -1, 0, 0).applyQuaternion(turned);
  const depth = THREE.MathUtils.smoothstep(Math.abs(view.dot(outward)), SIDE_ON[0], SIDE_ON[1]);
  const foot = rig.feet.find((f) => f.side === side);
  const hip = foot ? solved.fk.get(foot.thigh)?.pos : undefined;
  const knee = solved.points[`${side}_knee`];
  // A knee whose thigh does not swing from a still hip (the leg holds the body up) has no such sphere.
  if (!id.endsWith("_knee") || !swings || !hip || !knee) return { target, options: depth > 0.05 ? { view, depth } : { view } };

  const length = knee.distanceTo(hip);
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(turned);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(turned);
  const toTarget = target.clone().sub(hip);
  const now = knee.clone().sub(hip).normalize();
  const dir = new THREE.Vector3();
  const off = new THREE.Vector3();
  /** The thigh pointing `flexion` forwards and `abduction` outwards (radians), and what the knee there costs. */
  const cost = (flexion: number, abduction: number) => {
    dir.copy(down).multiplyScalar(Math.cos(flexion)).addScaledVector(forward, Math.sin(flexion)).multiplyScalar(Math.cos(abduction)).addScaledVector(outward, Math.sin(abduction));
    off.copy(dir).multiplyScalar(length).sub(toTarget);
    const along = off.dot(view);
    return off.lengthSq() - along * along + (depth * along) ** 2 - 1e-7 * Math.sin(flexion);
  };
  const range = (path: string) => [clampForDrag(path, -1e9), clampForDrag(path, 1e9)].map(THREE.MathUtils.degToRad);
  const [f0, f1] = range(`${side}_leg.hip_flexion`);
  const [a0, a1] = range(`${side}_leg.hip_abduction`);
  const COARSE = THREE.MathUtils.degToRad(3);
  /** The nearest low point of the cost from a start, by ever smaller steps. */
  const settle = (start: number[]) => {
    let best = [THREE.MathUtils.clamp(start[0], f0, f1), THREE.MathUtils.clamp(start[1], a0, a1)];
    let bestCost = cost(best[0], best[1]);
    for (let i = 0, step = COARSE; i < 14; i += 1, step /= 2) {
      for (let again = true; again; ) {
        again = false;
        for (const [df, da] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const f = THREE.MathUtils.clamp(best[0] + df * step, f0, f1);
          const a = THREE.MathUtils.clamp(best[1] + da * step, a0, a1);
          const c = cost(f, a);
          if (c < bestCost - 1e-12) [best, bestCost, again] = [[f, a], c, true];
        }
      }
    }
    return { at: best, cost: bestCost };
  };
  /** The best place with the thigh between two flexions: a coarse sweep, then settled. */
  const sweep = (from: number, to: number) => {
    let at = [from, 0];
    let lowest = Infinity;
    for (let f = from; f <= to + 1e-9; f += COARSE) {
      for (let a = a0; a <= a1 + 1e-9; a += COARSE) {
        const c = cost(f, a);
        if (c < lowest) [at, lowest] = [[f, a], c];
      }
    }
    return settle(at);
  };
  // Of the places as good as each other (the pointer's ray enters and leaves the sphere) the knee
  // keeps the one it is at; from a straight leg it comes up in front of the body, and goes behind
  // it only when the pointer is behind.
  const here = settle([Math.atan2(now.dot(forward), now.dot(down)), Math.asin(THREE.MathUtils.clamp(now.dot(outward), -1, 1))]);
  const [front, back] = [sweep(Math.max(0, f0), f1), sweep(f0, Math.min(0, f1))];
  const good = Math.min(here.cost, front.cost, back.cost) + ELSEWHERE;
  const best = (here.at[0] >= 0 && here.cost <= good ? here : front.cost <= good ? front : back.cost <= good ? back : here).at;
  cost(best[0], best[1]);
  // An exact place: the search goes there in space, not along the pointer's ray.
  return { target: hip.clone().addScaledVector(dir, length), options: {} };
}
