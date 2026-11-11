import * as THREE from "three";
import type { PoseAngles } from "./anatomy.ts";
import { buildRig, forwardKinematics, resolvePose, solvePoseCore, type Rig, type SolveContext, type WorldTransform } from "./pose-clip.ts";
import { POINT_IDS, type PointId } from "./pose-points.ts";
import { headOffset, reachFor, type Reach } from "./pose-reach.ts";
import type { RestPose } from "./rest-pose.ts";

/**
 * One avatar's pose session: the editor's held pose solved once per pose object (cached), the
 * solved bones written straight onto the skeleton (no AnimationClip, no mixer), and the body
 * points read from the bones themselves, so a point can never float away from the body. Timings
 * of each solve are kept for the HUD and the capture scripts.
 */

export type HeldSolve = {
  /** The pose as drawn: its goal reached and its pins turned into angles. */
  resolved: PoseAngles;
  local: Map<string, THREE.Quaternion>;
  hipsPosition: THREE.Vector3;
  fk: Map<string, WorldTransform>;
  /** World position of every body point the rig has. */
  points: Partial<Record<PointId, THREE.Vector3>>;
};

export type SessionStats = {
  /** Full pose solves since the session started. */
  solves: number;
  /** Candidate poses a leg drag tried on the whole body (see `probe`). */
  probes: number;
  /** Drag ticks since the session started. */
  ticks: number;
  /** Milliseconds of the latest solves (pose solve only) and of the latest drag ticks (reach + solve), newest last. */
  solveMs: number[];
  tickMs: number[];
};

const STATS_KEEP = 240;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sameCtx(a: SolveContext, b: SolveContext): boolean {
  return a.twoHanded === b.twoHanded && a.grip === b.grip && a.sockets === b.sockets && a.stance === b.stance;
}

/** The skeleton bone each point is drawn on (the head point adds `headOffset`). */
function pointBones(rig: Rig): Partial<Record<PointId, string>> {
  const n = rig.names;
  const chest = n.Neck ?? n[rig.spine[rig.spine.length - 1]];
  return {
    head: n.Head,
    chest,
    hips: n.Hips,
    left_elbow: n.LeftForeArm,
    right_elbow: n.RightForeArm,
    left_hand: n.LeftHand,
    right_hand: n.RightHand,
    left_knee: n.LeftLeg,
    right_knee: n.RightLeg,
    left_foot: n.LeftFoot,
    right_foot: n.RightFoot,
  };
}

export type PoseSession = ReturnType<typeof createPoseSession>;

export function createPoseSession(model: THREE.Object3D, rest: RestPose) {
  const rig = buildRig(model, rest);
  const cache = new WeakMap<PoseAngles, { ctx: SolveContext; solve: HeldSolve }>();
  const stats: SessionStats = { solves: 0, probes: 0, ticks: 0, solveMs: [], tickMs: [] };
  const boneOf = pointBones(rig);
  const head = headOffset(rig);
  const reaches = new Map<PointId, Reach | null>();
  const reach = (id: PointId) => {
    if (!reaches.has(id)) reaches.set(id, reachFor(rig, id));
    return reaches.get(id)!;
  };
  /** Points this rig can move: a point that cannot be dragged is not drawn. */
  const available = POINT_IDS.filter((id) => boneOf[id] && rest.has(boneOf[id]!) && (id === "hips" || reach(id) !== null));

  // Scene bones by name, looked up once.
  const bones = new Map<string, THREE.Object3D>();
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name, o);
  });

  const record = (list: number[], ms: number) => {
    list.push(ms);
    if (list.length > STATS_KEEP) list.shift();
  };

  const pointAt = (id: PointId, t: WorldTransform | undefined): THREE.Vector3 | undefined => {
    if (!t) return undefined;
    return id === "head" && head ? t.pos.clone().add(head.clone().applyQuaternion(t.quat)) : t.pos.clone();
  };

  return {
    rig,
    available,
    stats,
    reach,
    boneOf,
    /** The pose solved for display, once per pose object and context. */
    solve(pose: PoseAngles, ctx: SolveContext): HeldSolve {
      const hit = cache.get(pose);
      if (hit && sameCtx(hit.ctx, ctx)) return hit.solve;
      const t0 = performance.now();
      const resolved = resolvePose(pose, rig, ctx);
      const core = solvePoseCore(resolved, rig, ctx);
      const fk = forwardKinematics(rig, core.local, core.hipsPosition);
      const points: HeldSolve["points"] = {};
      for (const id of available) points[id] = pointAt(id, fk.get(boneOf[id]!));
      const solve: HeldSolve = { resolved, local: core.local, hipsPosition: core.hipsPosition, fk, points };
      stats.solves += 1;
      record(stats.solveMs, performance.now() - t0);
      cache.set(pose, { ctx, solve });
      return solve;
    },
    /**
     * Where a candidate pose would put these points. A leg cannot be tried on its own: the feet
     * carry the pelvis, so the search of a leg drag asks the whole body. Not cached, not drawn,
     * and counted apart from the solves; goals and pins are not resolved (the caller's pose has none to reach).
     * `bones` adds skeleton bones to what is worked out (returned in `fk`).
     */
    probe(pose: PoseAngles, ctx: SolveContext, ids: readonly PointId[], bones: string[] = []): { points: (THREE.Vector3 | undefined)[]; fk: Map<string, WorldTransform> } {
      stats.probes += 1;
      const core = solvePoseCore(pose, rig, ctx);
      const fk = forwardKinematics(rig, core.local, core.hipsPosition, [...ids.flatMap((id) => boneOf[id] ?? []), ...bones]);
      return { points: ids.map((id) => pointAt(id, boneOf[id] ? fk.get(boneOf[id]!) : undefined)), fk };
    },
    recordTick(ms: number) {
      stats.ticks += 1;
      record(stats.tickMs, ms);
    },
    /** The held pose onto the skeleton: every bone back to rest, then the solved rotations and the pelvis. */
    writeBones(solve: HeldSolve) {
      for (const [name, r] of rest) {
        const bone = bones.get(name);
        if (!bone) continue;
        bone.position.copy(r.position);
        bone.quaternion.copy(solve.local.get(name) ?? r.local);
        bone.scale.copy(r.scale);
      }
      const hips = rig.names.Hips ? bones.get(rig.names.Hips) : undefined;
      if (hips) hips.position.copy(solve.hipsPosition);
    },
    /** Where each point is on the skeleton as drawn now (playing or held): read from the bones. */
    readPoints(out: Partial<Record<PointId, THREE.Vector3>>): Partial<Record<PointId, THREE.Vector3>> {
      model.updateMatrixWorld(true);
      const q = new THREE.Quaternion();
      for (const id of available) {
        const bone = bones.get(boneOf[id]!);
        if (!bone) continue;
        const p = (out[id] ??= new THREE.Vector3());
        bone.getWorldPosition(p);
        if (id === "head" && head) p.add(head.clone().applyQuaternion(bone.getWorldQuaternion(q)));
      }
      return out;
    },
    /** World position of a skeleton joint by logical name ("HeadCenter" for the head point); null when absent. */
    joint(logical: string, out: THREE.Vector3): THREE.Vector3 | null {
      if (logical === "HeadCenter") {
        const bone = boneOf.head ? bones.get(boneOf.head) : undefined;
        if (!bone) return null;
        bone.getWorldPosition(out);
        if (head) out.add(head.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion())));
        return out;
      }
      const name = rig.names[logical as keyof Rig["names"]];
      const bone = name ? bones.get(name) : undefined;
      return bone ? bone.getWorldPosition(out) : null;
    },
  };
}
