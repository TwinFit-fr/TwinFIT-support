/**
 * What each body point of a pose is, compared with the automatic pose (what the exercise template,
 * or the AI draft built on it, produces for the draft's settings): "automatic" while its joints are
 * exactly that, "set" once they differ. Derived, never stored: undo, a save or a reload never put
 * it out of step with the angles. Also how a point is given back to the automatic pose, and how
 * the points set by hand are carried across a rebuild of the poses from the template. Pure.
 */

import { ANCHOR_IDS, POSE_GROUPS, getPoseValue, setPoseValue, type PoseAngles, type PoseAnchors } from "./anatomy.ts";
import { buildTemplate, type TemplateExercise } from "./exercise-templates.ts";
import { POINT_IDS, POINT_LABEL, type PointId } from "./pose-points.ts";
import { hasTemplate } from "./template-draft.ts";
import { paramsFromMeta } from "./template-settings.ts";

export type PointState = "automatic" | "set";

const fieldsOf = (group: string) => POSE_GROUPS.find((g) => g.id === group)?.fields.map((f) => f.path) ?? [];
const only = (paths: string[], ...fields: string[]) => paths.filter((p) => fields.some((f) => p.endsWith(`.${f}`)));
const ARM_ELBOW = ["shoulder_plane", "shoulder_elevation", "shoulder_rotation", "elbow_flexion", "scapula_protraction", "scapula_elevation"];
const LEG_KNEE = ["hip_flexion", "hip_abduction", "hip_rotation", "knee_flexion"];

/**
 * The joints that make a point what it is. A hand or a foot is its whole limb (a drag of it turns
 * every joint of the arm or the leg); an elbow or a knee is the part of the limb above it; the
 * chest is the spine; the head its neck; the hips the pelvis and the whole body's lean and turn.
 * The bar is not a body point.
 */
export const POINT_PATHS: Record<PointId, readonly string[]> = {
  hips: fieldsOf("hips"),
  chest: fieldsOf("torso").filter((p) => p.startsWith("lumbar.") || p.startsWith("thoracic.")),
  head: fieldsOf("torso").filter((p) => p.startsWith("head.")),
  left_hand: fieldsOf("left_arm"),
  right_hand: fieldsOf("right_arm"),
  left_elbow: only(fieldsOf("left_arm"), ...ARM_ELBOW),
  right_elbow: only(fieldsOf("right_arm"), ...ARM_ELBOW),
  left_foot: fieldsOf("left_leg"),
  right_foot: fieldsOf("right_leg"),
  left_knee: only(fieldsOf("left_leg"), ...LEG_KNEE),
  right_knee: only(fieldsOf("right_leg"), ...LEG_KNEE),
};

/** Every body joint a point owns (each path once), in the order of the body. */
const BODY_PATHS: readonly string[] = [...new Set(POINT_IDS.flatMap((id) => POINT_PATHS[id]))];

const IMPLEMENT_PATHS: readonly string[] = fieldsOf("implement");

const EPS = 1e-6;

type DraftLike = { poses: PoseAngles[]; meta: Record<string, unknown> | null | undefined };

/**
 * The automatic poses of a draft: what its template builds for the settings it carries. Null when
 * the draft has no template base (angles the AI wrote itself, a neutral pose, an exercise without
 * a template, an older clip that does not say which settings made it).
 */
export function automaticPoses(ex: TemplateExercise | null, draft: DraftLike): PoseAngles[] | null {
  return automaticDraft(ex, draft)?.poses ?? null;
}

/** The same with the template's names of the poses. */
export function automaticDraft(ex: TemplateExercise | null, draft: DraftLike): { poses: PoseAngles[]; labels: string[] } | null {
  if (!ex || !hasTemplate(ex)) return null;
  const meta = draft.meta;
  if (!meta || typeof meta.template !== "string" || !meta.template || !meta.template_params || typeof meta.template_params !== "object") return null;
  const built = buildTemplate(ex, paramsFromMeta(meta));
  return { poses: built.poses, labels: built.labels };
}

/**
 * The paths a template's height goal decides in this pose, when the pose no longer has the goal
 * because a drag replaced it by what it resolved to (pose-drag.ts): the value there is still the
 * automatic one, worked out on the rig, so it does not count as set by hand.
 */
function resolvedGoalPaths(pose: PoseAngles, auto: PoseAngles): string[] {
  if (!auto.goal || pose.goal) return [];
  return [auto.goal.by === "pelvis" ? "hips.height_m" : "hips.pitch"];
}

/** The body joints whose value in `pose` is not the automatic pose's. */
export function changedPaths(pose: PoseAngles, auto: PoseAngles): Set<string> {
  const skip = resolvedGoalPaths(pose, auto);
  const out = new Set<string>();
  for (const path of BODY_PATHS) {
    if (skip.includes(path)) continue;
    const a = getPoseValue(pose, path);
    const b = getPoseValue(auto, path);
    if (a === null && b === null) continue;
    if (a === null || b === null || Math.abs(a - b) > EPS) out.add(path);
  }
  return out;
}

/** Each point of `pose`: automatic, or set by you (one of its joints differs from the automatic pose). */
export function pointStates(pose: PoseAngles, auto: PoseAngles): Record<PointId, PointState> {
  const changed = changedPaths(pose, auto);
  return Object.fromEntries(POINT_IDS.map((id) => [id, POINT_PATHS[id].some((p) => changed.has(p)) ? "set" : "automatic"])) as Record<PointId, PointState>;
}

/** The points of `pose` that are set by you, in the order of POINT_IDS. */
export function setPoints(pose: PoseAngles, auto: PoseAngles): PointId[] {
  const states = pointStates(pose, auto);
  return POINT_IDS.filter((id) => states[id] === "set");
}

/**
 * The pose with one point given back: its joints take the automatic pose's values again (the hips
 * also get the template's height goal back, when a drag had replaced it). Pins stay: a pin is
 * set and cleared on its own.
 */
export function giveBack(pose: PoseAngles, auto: PoseAngles, point: PointId): PoseAngles {
  let next = pose;
  for (const path of POINT_PATHS[point]) {
    const value = getPoseValue(auto, path);
    if (value === null && path !== "hips.height_m") continue;
    if (getPoseValue(next, path) !== value) next = setPoseValue(next, path, value);
  }
  if (point === "hips" && auto.goal && !next.goal) next = { ...next, goal: structuredClone(auto.goal) };
  return next;
}

/** Pins that are not the automatic pose's (added, moved or removed by the user), kept on `next`. */
function carryAnchors(pose: PoseAngles, auto: PoseAngles, next: PoseAngles): PoseAngles {
  let anchors: PoseAnchors | undefined = next.anchors ? { ...next.anchors } : undefined;
  let touched = false;
  for (const id of ANCHOR_IDS) {
    const mine = pose.anchors?.[id];
    const theirs = auto.anchors?.[id];
    if (JSON.stringify(mine ?? null) === JSON.stringify(theirs ?? null)) continue;
    touched = true;
    anchors = { ...(anchors ?? {}) };
    if (mine) anchors[id] = [...mine];
    else delete anchors[id];
  }
  if (!touched) return next;
  const out = { ...next };
  if (anchors && Object.keys(anchors).length) out.anchors = anchors;
  else delete out.anchors;
  return out;
}

export type Carried = {
  poses: PoseAngles[];
  /** Per pose, the points whose joints were kept (empty: that pose is the new automatic pose). */
  kept: PointId[][];
};

/**
 * The poses rebuilt from the template (`next`), with what the user set by hand kept: in each pose,
 * every joint that differed from the old automatic pose keeps its value, and so do pins the user
 * added or moved; everything else is the new automatic pose. Null when the poses cannot be matched
 * one to one (a pose was added or removed, or the template builds another number of poses).
 */
export function carrySetByYou(current: PoseAngles[], before: PoseAngles[], next: PoseAngles[]): Carried | null {
  if (current.length !== before.length || current.length !== next.length) return null;
  const kept: PointId[][] = [];
  const poses = next.map((built, i) => {
    const pose = current[i];
    const auto = before[i];
    const changed = changedPaths(pose, auto);
    let out = built;
    for (const path of changed) out = setPoseValue(out, path, getPoseValue(pose, path));
    // The bar's place and what the pose panel sets for the whole body (support, flat feet) are kept too.
    for (const path of IMPLEMENT_PATHS) {
      const mine = getPoseValue(pose, path);
      if (mine !== null && mine !== getPoseValue(auto, path)) out = setPoseValue(out, path, mine);
    }
    for (const key of ["orientation", "feet_flat"] as const) {
      if (pose[key] !== auto[key]) out = { ...out, [key]: pose[key] };
    }
    out = carryAnchors(pose, auto, out);
    kept.push(POINT_IDS.filter((id) => POINT_PATHS[id].some((p) => changed.has(p))));
    return out;
  });
  return { poses, kept };
}

/**
 * Whether a rebuild from the template can keep what was set by hand: "match" when every pose has
 * its automatic pose (carrySetByYou keeps the rest), "count" when a pose was added or removed,
 * "no-base" when the poses were not built from the template at all.
 */
export type RebuildMatch = { kind: "match" } | { kind: "count"; poses: number; built: number } | { kind: "no-base"; poses: number };

export function rebuildMatch(current: PoseAngles[], auto: PoseAngles[] | null): RebuildMatch {
  if (!auto) return { kind: "no-base", poses: current.length };
  return auto.length === current.length ? { kind: "match" } : { kind: "count", poses: current.length, built: auto.length };
}

/** The points a pose can pin (end effectors, and knees as poles). */
export const PINNABLE: readonly PointId[] = ANCHOR_IDS;

export function isPinnable(point: PointId): point is (typeof ANCHOR_IDS)[number] {
  return (ANCHOR_IDS as readonly string[]).includes(point);
}

/** The points pinned in this pose, in the order of POINT_IDS. */
export function pinnedPoints(pose: PoseAngles): PointId[] {
  return POINT_IDS.filter((id) => isPinnable(id) && Boolean(pose.anchors?.[id]));
}

/**
 * The pose with the point pinned where it is drawn now (`at`, world metres), or unpinned. Null
 * when nothing changes: the point cannot be pinned, or its position is not known yet.
 */
export function withPin(pose: PoseAngles, point: PointId, pin: boolean, at: readonly [number, number, number] | undefined): PoseAngles | null {
  if (!isPinnable(point)) return null;
  const has = Boolean(pose.anchors?.[point]);
  if (has === pin) return null;
  const anchors: PoseAnchors = { ...(pose.anchors ?? {}) };
  if (pin) {
    if (!at) return null;
    anchors[point] = [at[0], at[1], at[2]];
  } else delete anchors[point];
  const out: PoseAngles = { ...pose, anchors };
  if (!Object.keys(anchors).length) delete out.anchors;
  return out;
}

type Content = { poses: PoseAngles[]; labels: string[] | null };

/**
 * New content rebuilt from the template (a setting change, an AI draft built on the template),
 * with what was set by hand in the current content kept: joints and pins (carrySetByYou) and the
 * names the user typed over the template's. Null when the poses cannot be matched one to one or
 * the current poses have no template base (`before` null): the new content then replaces them.
 */
export function keepSetByYou<T extends Content>(current: Content, before: Content | null, next: T): { next: T; kept: PointId[][]; edited: boolean } | null {
  if (!before) return null;
  const carried = carrySetByYou(current.poses, before.poses, next.poses);
  if (!carried) return null;
  const typed = (current.labels ?? []).map((name, i) => (name && name.trim() && name !== before.labels?.[i] ? name : null));
  const labels = typed.some(Boolean) ? next.poses.map((_, i) => typed[i] ?? next.labels?.[i] ?? "") : next.labels;
  const edited = JSON.stringify(carried.poses) !== JSON.stringify(next.poses) || labels !== next.labels;
  return { next: { ...next, poses: carried.poses, labels }, kept: carried.kept, edited };
}

/**
 * The accessible name of a body point on the stage, with its state: "Left hand, set by you,
 * pinned, dragging moves the arm". Without an automatic pose only the pin is said.
 */
export function pointName(point: PointId, { state, pinned, hint }: { state: PointState | null; pinned: boolean; hint: string }): string {
  const parts = [POINT_LABEL[point], state === "set" ? "set by you" : state === "automatic" ? "automatic" : null, pinned ? "pinned" : null, `dragging ${hint}`];
  return parts.filter(Boolean).join(", ");
}

/** The points in words, a whole limb said once: "left arm" for its elbow and hand, "right leg" for its knee and foot. */
function pointWords(points: PointId[]): string[] {
  const out: string[] = [];
  for (const id of points) {
    const limb = /^(left|right)_(elbow|hand|knee|foot)$/.exec(id);
    if (limb) {
      const [, side, part] = limb;
      const arm = part === "elbow" || part === "hand";
      const pair = `${side}_${arm ? (part === "elbow" ? "hand" : "elbow") : part === "knee" ? "foot" : "knee"}` as PointId;
      if (points.includes(pair)) {
        const word = `${side} ${arm ? "arm" : "leg"}`;
        if (!out.includes(word)) out.push(word);
        continue;
      }
    }
    out.push(POINT_LABEL[id].toLowerCase());
  }
  return out;
}

/** "left hand", "left arm and hips", "left hand, chest and hips". */
function pointsPhrase(points: PointId[]): string {
  const names = pointWords(points);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What a carry kept, in one line for the stage or a toast: "Kept what you set: left hand in pose 2,
 * hips in poses 1 and 3." Null when nothing was set by hand.
 */
export function keptSummary(kept: PointId[][]): string | null {
  // Group the poses by the points kept in them, so a hand kept in every pose is said once.
  const byPoints = new Map<string, { points: PointId[]; poses: number[] }>();
  kept.forEach((points, i) => {
    if (!points.length) return;
    const key = points.join();
    const row = byPoints.get(key) ?? { points, poses: [] };
    row.poses.push(i + 1);
    byPoints.set(key, row);
  });
  if (!byPoints.size) return null;
  const all = kept.length;
  const parts = [...byPoints.values()].map(({ points, poses }) => {
    const where = poses.length === all && all > 1 ? "every pose" : poses.length === 1 ? `pose ${poses[0]}` : `poses ${poses.slice(0, -1).join(", ")} and ${poses[poses.length - 1]}`;
    return `${pointsPhrase(points)} in ${where}`;
  });
  return `Kept what you set: ${parts.join("; ")}.`;
}
