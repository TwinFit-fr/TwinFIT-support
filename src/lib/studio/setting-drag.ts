/**
 * A drag on the stage in Exercise mode: the pointer picks the template setting whose choices bring
 * the dragged point closest to it. Each setting is a track: the screen positions the point takes
 * for each of its choices, in order (hips at partial, full, deep range). The pointer's travel since
 * the press is laid on every track from the current choice; the nearest track wins, and the place
 * on it says how far between two choices the body is drawn. Pure: the stage projects the points.
 */

import { lerpPose, type PoseAngles } from "./anatomy.ts";
import { buildTemplate, type TemplateExercise, type TemplateParams } from "./exercise-templates.ts";
import { optionOf, settingsFor, type ChoiceKey } from "./template-settings.ts";

export type ScreenXY = { x: number; y: number };

/** One setting's choices for a drag: the poses they build and, once projected, where the point goes. */
export type Candidates = {
  key: ChoiceKey;
  /** The pose of the clip these candidates are for. */
  keyframe: number;
  /** The choices in order (one per distinct set of poses). */
  values: string[];
  /** Index of the draft's current choice. */
  current: number;
  /** The settings each choice stands for (the draft's settings with this one changed). */
  params: TemplateParams[];
  /** The pose being dragged, for each choice. */
  poses: PoseAngles[];
  /** The first pose of the clip for each choice (where the feet are planted). */
  stances: PoseAngles[];
};

/** The choices of every setting this exercise has, at pose `keyframe`, from the draft's settings. */
export function dragCandidates(ex: TemplateExercise, params: TemplateParams, keyframe: number): Candidates[] {
  return settingsFor(ex).map((setting) => {
    const values = setting.options.map((o) => o.value);
    const current = Math.max(0, values.indexOf(optionOf(setting, params[setting.key])?.value ?? ""));
    const variants = values.map((value) => ({ ...params, [setting.key]: value }) as TemplateParams);
    const built = variants.map((p) => buildTemplate(ex, p).poses);
    return {
      key: setting.key,
      keyframe,
      values,
      current,
      params: variants,
      poses: built.map((poses) => poses[Math.min(keyframe, poses.length - 1)]),
      stances: built.map((poses) => poses[0]),
    };
  });
}

/** The pose drawn at place `t` on a track (between choice ⌊t⌋ and ⌈t⌉), with its stance. */
export function poseAlong(c: Candidates, t: number): { pose: PoseAngles; stance: PoseAngles } {
  const clamped = Math.max(0, Math.min(c.values.length - 1, t));
  const a = Math.floor(clamped);
  const b = Math.min(c.values.length - 1, a + 1);
  const u = clamped - a;
  if (u < 1e-3 || a === b) return { pose: c.poses[a], stance: c.stances[a] };
  return { pose: lerpPose(c.poses[a], c.poses[b], u), stance: lerpPose(c.stances[a], c.stances[b], u) };
}

export type Track = { key: ChoiceKey; keyframe: number; values: string[]; current: number; screen: ScreenXY[] };

export type DragChoice = {
  key: ChoiceKey;
  /** The pose the setting is seen on (a squat's depth shows on its bottom pose). */
  keyframe: number;
  /** Place on the track: 1.4 is 40 % of the way from choice 1 to choice 2. */
  t: number;
  /** The choice a release applies (see commitIndex). */
  index: number;
  value: string;
  /** The pointer is far from every track: no setting moves the point that way. */
  off: boolean;
  /** The pointer is past the last choice, along the track: as far as the setting goes. */
  limit: boolean;
  /** Chosen from a real move of the pointer (false while it is still the press: no setting is followed yet). */
  settled: boolean;
};

/** A setting that moves the point less than this on screen does not move it at all. */
export const MIN_SPAN_PX = 10;
/** Another setting takes over only when it is this much nearer than the one being followed; settings this close are a tie. */
export const SWITCH_PX = 14;
/** Settings whose first steps point along the pointer's travel within this (cosine) are a tie. */
export const HEADING_TIE = 0.2;
/** Between settings about as near, another one is followed only when it moves the point this many times more. */
export const MORE = 1.5;
/** Pointer travel below this is still the press. */
export const DEAD_PX = 4;
/** Farther than this from every track, the pointer asks for something no setting does. */
export const OFF_TRACK_PX = 70;
/** How far towards the next choice (as a share of the step) the pointer must go for a release to apply it. */
export const COMMIT_SHARE = 0.35;

/**
 * The choice a release at place `t` applies: the next one in the drag's direction once the pointer
 * is a third of the way there, so a short pull still changes the setting, and pushing back by as
 * much returns to the choice the drag started on.
 */
export function commitIndex(t: number, current: number, count: number): number {
  const index = t > current ? Math.floor(t + 1 - COMMIT_SHARE + 1e-9) : t < current ? Math.ceil(t - 1 + COMMIT_SHARE - 1e-9) : current;
  return Math.max(0, Math.min(count - 1, index));
}

const span = (track: Track) => track.screen.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - track.screen[i].x, p.y - track.screen[i].y), 0);

/** The tracks along which the point really moves. */
export function usefulTracks(tracks: Track[]): Track[] {
  return tracks.filter((track) => track.screen.length > 1 && span(track) >= MIN_SPAN_PX);
}

/** How well a track's first step from the current choice, either way, points along the pointer's travel (cosine, -1 when it does not move). */
function heading(track: Track, dx: number, dy: number): number {
  const c = track.screen[track.current];
  const travel = Math.hypot(dx, dy);
  let best = -1;
  for (const step of [-1, 1]) {
    for (let i = track.current + step; i >= 0 && i < track.screen.length; i += step) {
      const ox = track.screen[i].x - c.x;
      const oy = track.screen[i].y - c.y;
      const len = Math.hypot(ox, oy);
      if (len < 2) continue;
      best = Math.max(best, (ox * dx + oy * dy) / (len * travel));
      break;
    }
  }
  return best;
}

const same = (track: Track, choice: DragChoice | null) => Boolean(choice && track.key === choice.key && track.keyframe === choice.keyframe);

/**
 * The place on a track nearest to `target`, how far it is, whether the target lies outwards of an
 * end of the track (`past`: the body stops at that end), and whether it lies past it in the track's
 * own direction (`beyond`: farther than the setting goes, rather than off to the side).
 */
export function nearestOnTrack(track: Track, target: ScreenXY): { t: number; dist: number; beyond: boolean; past: boolean } {
  let best = { t: track.current, dist: Infinity, beyond: false, past: false };
  for (let i = 0; i < track.screen.length - 1; i += 1) {
    const a = track.screen[i];
    const b = track.screen[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const u = len2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / len2));
    const dist = Math.hypot(a.x + dx * u - target.x, a.y + dy * u - target.y);
    if (dist < best.dist - 1e-6) {
      // Past this end of the track: the offset from the end runs outwards, within 60 degrees of the segment.
      const len = Math.sqrt(len2);
      const atEnd = (u >= 1 && i === track.screen.length - 2) || (u <= 0 && i === 0);
      const along = len > 1e-6 ? ((target.x - (a.x + dx * u)) * dx + (target.y - (a.y + dy * u)) * dy) / len : 0;
      const outward = u >= 1 ? along : -along;
      const beyond = atEnd && dist > 0 && outward >= dist * 0.5;
      best = { t: i + u, dist, beyond, past: atEnd && outward > 0 };
    }
  }
  return best;
}

/**
 * The setting and the place on it that bring the point nearest to where the pointer asks: the
 * pointer's travel since the press (`from` → `to`), laid from the point's current place on each
 * track (tracks may be on different poses of the clip). The setting followed so far keeps the drag
 * unless another is clearly nearer. Between settings about as near, the one whose first step runs
 * most along the pointer's travel wins (the chest pulled forward is lean, not depth), and among
 * those the first listed (the stage's own pose) unless another moves the point clearly more (the
 * hips pulled down are depth, not the little a wider stance lowers them). Null when no setting moves the point.
 */
export function chooseSetting(tracks: Track[], from: ScreenXY, to: ScreenXY, previous: DragChoice | null): DragChoice | null {
  const useful = usefulTracks(tracks);
  if (!useful.length) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scored = useful.map((track) => {
    const start = track.screen[track.current];
    return { track, ...nearestOnTrack(track, { x: start.x + dx, y: start.y + dy }) };
  });
  const choice = (s: (typeof scored)[number], off: boolean): DragChoice => {
    const index = commitIndex(s.t, s.track.current, s.track.values.length);
    return { key: s.track.key, keyframe: s.track.keyframe, t: s.t, index, value: s.track.values[index], off, limit: !off && s.past && s.dist > DEAD_PX, settled: true };
  };
  if (Math.hypot(dx, dy) < DEAD_PX) {
    const kept = scored.find((s) => same(s.track, previous)) ?? scored[0];
    return { ...choice({ ...kept, t: kept.track.current }, false), settled: Boolean(previous?.settled && same(kept.track, previous)) };
  }
  const nearest = Math.min(...scored.map((s) => s.dist));
  // A setting is kept only once a real move chose it: what the press showed first decides nothing.
  const kept = previous?.settled ? scored.find((s) => same(s.track, previous)) : undefined;
  // Kept unless another setting is clearly nearer: the same setting seen on another pose gives the same choice, so taking the stage there gains nothing.
  const clearlyNearer = kept ? scored.filter((s) => s.dist < kept.dist - SWITCH_PX && s.track.key !== kept.track.key) : [];
  let best = kept && !clearlyNearer.length ? kept : null;
  if (!best) {
    const near = scored.filter((s) => s.dist <= nearest + SWITCH_PX).map((s) => ({ ...s, aim: heading(s.track, dx, dy) }));
    const top = Math.max(...near.map((s) => s.aim));
    // The track listed first (the pose on the stage) keeps it unless another moves the point clearly more.
    best = near.filter((s) => s.aim >= top - HEADING_TIE).reduce((a, b) => (span(b.track) > span(a.track) * MORE + 1 ? b : a));
  }
  return choice(best, best.dist > OFF_TRACK_PX && !best.beyond);
}

/**
 * What a release past the end of a setting leaves over: the pointer's travel the body could not
 * follow (the foot stopped at the widest stance, the pointer went on). The next drag of the same
 * point starts that much further out, so dragging back as far as the pointer went out returns the
 * body to where the first drag started. Null when the release was not past an end.
 */
export function overshootOf(track: Track, from: ScreenXY, to: ScreenXY, choice: DragChoice): ScreenXY | null {
  if (!choice.limit || choice.off || track.key !== choice.key || track.keyframe !== choice.keyframe) return null;
  const start = track.screen[track.current];
  const end = track.screen[choice.index];
  const over = { x: start.x + to.x - from.x - end.x, y: start.y + to.y - from.y - end.y };
  return Math.hypot(over.x, over.y) > DEAD_PX ? over : null;
}

/** Where the next drag's travel is counted from: the press, moved back by what the last release left over. */
export function carriedStart(press: ScreenXY, overshoot: ScreenXY | null): ScreenXY {
  return overshoot ? { x: press.x - overshoot.x, y: press.y - overshoot.y } : press;
}

/**
 * One frame of the drawn pose easing towards `goal`: every angle a fraction `u` of the way there,
 * everything else (support, flags, goals) already the goal's, so the body glides between two
 * template poses instead of jumping, and lands on exactly the goal.
 */
export function easePose(shown: PoseAngles, goal: PoseAngles, u: number): PoseAngles {
  if (u >= 1) return goal;
  const m = lerpPose(shown, goal, u);
  const sh = shown.hips.height_m;
  const gh = goal.hips.height_m;
  return {
    ...goal,
    hips: { ...m.hips, height_m: sh !== null && gh !== null ? m.hips.height_m : gh },
    lumbar: m.lumbar,
    thoracic: m.thoracic,
    head: m.head,
    left_arm: m.left_arm,
    right_arm: m.right_arm,
    left_leg: m.left_leg,
    right_leg: m.right_leg,
    implement: shown.implement && goal.implement ? m.implement : goal.implement,
  };
}

/** How far a frame of `dtMs` eases towards the goal (a time constant of `tauMs`); all the way with reduced motion. */
export function easeStep(dtMs: number, reducedMotion: boolean, tauMs = 70): number {
  return reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
}

/** Whether two poses are drawn the same to the eye (every angle within `eps` degrees, the pelvis within a millimetre). */
export function closeTo(a: PoseAngles, b: PoseAngles, eps = 0.25): boolean {
  const groups = ["lumbar", "thoracic", "head", "left_arm", "right_arm", "left_leg", "right_leg"] as const;
  for (const g of groups) {
    const x = a[g] as Record<string, number>;
    const y = b[g] as Record<string, number>;
    for (const k of Object.keys(y)) if (Math.abs((x[k] ?? 0) - y[k]) > eps) return false;
  }
  const ah = a.hips.height_m;
  const bh = b.hips.height_m;
  if ((ah === null) !== (bh === null) || (ah !== null && bh !== null && Math.abs(ah - bh) > 0.001)) return false;
  return Math.abs(a.hips.pitch - b.hips.pitch) <= eps && Math.abs(a.hips.yaw - b.hips.yaw) <= eps && Math.abs(a.hips.roll - b.hips.roll) <= eps && Math.abs(a.hips.forward_m - b.hips.forward_m) <= 0.001;
}
