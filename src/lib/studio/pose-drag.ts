import * as THREE from "three";
import { getPoseValue, mirrorPath, setPoseValue, type AnchorId, type PoseAngles } from "./anatomy.ts";
import type { SolveContext } from "./pose-clip.ts";
import { bodyPlace, legAim, legOf, legStart, levelSole, movesAlone, settleLeg, trialContext } from "./pose-legs.ts";
import { mirrorPoint, type PointId } from "./pose-points.ts";
import { reachPose } from "./pose-reach.ts";
import type { HeldSolve, PoseSession } from "./pose-session.ts";

/**
 * The editing rules shared by the sliders and the viewport: one place decides what a change does
 * to the pose (mirror, goals, pins), so a slider and a drag of the same joint behave the same.
 */

export type EditOptions = { mirror: boolean };
/** A drag's options: Mirror, and the camera's view direction for a pointer drag (its depth is then soft, see pose-reach). */
export type DragOptions = EditOptions & { view?: THREE.Vector3 };

/**
 * Set pose fields. With Mirror on, a left or right field writes the same value to the other side
 * (the same anatomical posture, mirrored). Touching the pelvis by hand ends a template's goal.
 */
export function applyPoseEdit(pose: PoseAngles, changes: Record<string, number | null>, { mirror }: EditOptions): PoseAngles {
  let next = pose;
  for (const [path, value] of Object.entries(changes)) {
    next = setPoseValue(next, path, value);
    const other = mirror ? mirrorPath(path) : null;
    if (other) next = setPoseValue(next, other, value);
  }
  if (next.goal && Object.keys(changes).some((path) => path.startsWith("hips."))) next = { ...next, goal: undefined };
  return next;
}

/** The limits a pelvis drag keeps to (metres). */
export const HIPS_DRAG = { minHeight: 0.05, forward: 0.6 } as const;

const ANCHOR_OF: Partial<Record<PointId, AnchorId>> = {
  left_hand: "left_hand",
  right_hand: "right_hand",
  left_foot: "left_foot",
  right_foot: "right_foot",
  left_knee: "left_knee",
  right_knee: "right_knee",
};

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The highest the pelvis of a standing body can go, `ahead` metres forward of where it is, with
 * the feet that are on the floor staying there: the legs straight, not pulled off the floor.
 */
function legsReach(session: PoseSession, solved: HeldSolve, pose: PoseAngles, ahead: number): number {
  const pelvis = solved.points.hips;
  let top = Infinity;
  for (const foot of session.rig.feet) {
    const [hip, knee, ankle] = [foot.thigh, foot.shank, foot.name].map((bone) => solved.fk.get(bone)?.pos);
    if (!pelvis || !hip || !knee || !ankle || foot.side === pose.free_foot || ankle.y - foot.ankleRestY > FLOOR_M) continue;
    const length = (hip.distanceTo(knee) + knee.distanceTo(ankle)) * 0.999;
    const across = Math.hypot(hip.x - ankle.x, hip.z + ahead - ankle.z);
    top = Math.min(top, ankle.y + Math.sqrt(Math.max(0, length * length - across * across)) - (hip.y - pelvis.y));
  }
  return top;
}

/** A foot this close to its height on the floor is on it (metres). */
const FLOOR_M = 0.03;

/** Keeps the sole of a standing body's free foot level while it is near the floor, from where the foot is drawn now. */
function soleLevel(session: PoseSession, solved: HeldSolve, side: "left" | "right"): ((pose: PoseAngles) => PoseAngles) | null {
  const foot = session.rig.feet.find((f) => f.side === side);
  const ankle = solved.points[`${side}_foot`];
  return foot && ankle ? (pose) => levelSole(pose, side, ankle.y - foot.ankleRestY) : null;
}

/**
 * The pose with a body point dragged to `target` (world metres). The drag starts from the pose as
 * drawn: a template's goal is replaced by what it resolved to, so nothing jumps. With a view
 * direction (a pointer drag) the point stays under the pointer and the body picks its depth. Limbs, the chest
 * and the head move by their own angles inside their range of motion; the pelvis by its height
 * and forward offset (it has no sideways offset in the pose model), never higher than the legs
 * reach from the feet on the floor. A leg is tried on the whole body, because the feet carry the
 * pelvis; standing, it moves alone whatever Mirror says, and stops carrying the body when the body
 * stays where it is without it (pose-legs.ts). A pinned point moves its pin. A foot of a later
 * standing pose is held where the first pose planted it, so dragging it pins it where it is
 * dropped. Uses the session's cached solve of `pose`: no extra solve.
 */
export function dragPoint(session: PoseSession, pose: PoseAngles, ctx: SolveContext, id: PointId, target: THREE.Vector3, opts: DragOptions): PoseAngles {
  const solved = session.solve(pose, ctx);
  // Drawn pose, minus the goal it already reached (anchors stay: they are still meant).
  const base: PoseAngles = pose.goal ? { ...solved.resolved, goal: undefined } : pose;
  if (id === "hips") {
    const here = solved.points.hips;
    if (!here) return base;
    const forward = THREE.MathUtils.clamp(base.hips.forward_m + target.z - here.z, -HIPS_DRAG.forward, HIPS_DRAG.forward);
    const top = base.orientation === "standing" ? legsReach(session, solved, base, forward - base.hips.forward_m) : Infinity;
    return applyPoseEdit(base, { "hips.height_m": round3(Math.max(HIPS_DRAG.minHeight, Math.min(target.y, top))), "hips.forward_m": round3(forward) }, opts);
  }
  const given = session.reach(id);
  if (!given) return base;
  const leg = legOf(id);
  const alone = movesAlone(base, id);
  const start = leg && alone ? legStart(session, base, ctx, leg, solved) : { pose: base, holds: false };
  // The foot the body stands on stays under it. Its knee tilts the shank over that foot, forwards
  // (the knee bends) or sideways (the hip), and the body rides on it without turning.
  if (start.holds && id.endsWith("_foot")) return base;
  const reach = start.holds ? { ...given, dofs: [`${leg}_leg.hip_abduction`, `${leg}_leg.knee_flexion`], prefer: undefined, escape: undefined } : given;
  const from = start.pose;
  const aim = leg ? legAim(session, solved, id, target, opts.view, !start.holds) : { target, options: { view: opts.view } };
  const sole = leg && alone ? soleLevel(session, solved, leg) : null;
  const reached = reachPose(session.rig, solved.fk, from, reach, aim.target, { ...aim.options, place: leg ? bodyPlace(session, trialContext(ctx, pose), id, sole ?? undefined) : undefined });
  const changes: Record<string, number> = {};
  for (const dof of reach.dofs) {
    const value = getPoseValue(reached, dof);
    if (value !== null && value !== getPoseValue(from, dof)) changes[dof] = value;
  }
  let next = applyPoseEdit(from, changes, { mirror: opts.mirror && !alone });
  if (sole) next = sole(next);
  const anchor = ANCHOR_OF[id];
  const later = Boolean(ctx.stance) && ctx.stance !== pose && pose.orientation === "standing";
  const pinFoot = id.endsWith("_foot") && later && next.free_foot !== leg; // a free foot follows its own angles: nothing holds it back
  if (anchor && (base.anchors?.[anchor] || pinFoot)) {
    next = { ...next, anchors: { ...next.anchors, [anchor]: [round3(target.x), round3(target.y), round3(target.z)] } };
  }
  return next;
}

/** Does Mirror copy a drag of this point to the other side of this pose? Not for a central point, nor for a leg of a standing body. */
export function mirrorApplies(pose: PoseAngles, id: PointId): boolean {
  return mirrorPoint(id) !== null && !movesAlone(pose, id);
}

/** The pose once a drag of `id` has ended: a leg that was moved settles (see pose-legs.ts). */
export function settleDrag(session: PoseSession, pose: PoseAngles, ctx: SolveContext, id: PointId): PoseAngles {
  const leg = legOf(id);
  return leg ? settleLeg(session, pose, ctx, leg) : pose;
}
