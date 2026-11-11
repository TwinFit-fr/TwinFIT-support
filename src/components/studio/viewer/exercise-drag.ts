"use client";

import type * as THREE from "three";
import type { PoseAngles } from "@/lib/studio/anatomy";
import { draftParams } from "@/lib/studio/draft-params";
import { dragModeNow } from "@/lib/studio/drag-mode";
import { buildTemplate, type TemplateExercise, type TemplateParams } from "@/lib/studio/exercise-templates";
import type { SolveContext } from "@/lib/studio/pose-clip";
import { POINT_LABEL, toScreen, type PointId } from "@/lib/studio/pose-points";
import type { PoseSession } from "@/lib/studio/pose-session";
import { replacesNote } from "@/lib/studio/rebuild-words";
import { carriedStart, chooseSetting, closeTo, dragCandidates, easePose, easeStep, overshootOf, poseAlong, usefulTracks, type Candidates, type DragChoice, type Track } from "@/lib/studio/setting-drag";
import { useStudioStore } from "@/lib/studio/store";
import { SETTING_LABEL, valueLabel } from "@/lib/studio/template-settings";
import type { AvatarSocket } from "@/lib/studio/types";
import { applyTemplateSettings } from "../hooks/use-template-settings";
import { poseStage, type ExerciseStatus, type ScreenXY } from "./pose-stage";

type View = { camera: THREE.Camera; size: { width: number; height: number }; sockets: AvatarSocket[] };
type Drawn = { pose: PoseAngles; stance: PoseAngles };

type Active = {
  id: PointId;
  exercise: TemplateExercise;
  from: TemplateParams;
  /** The pose held when the drag started, and the template's names of its poses ("standing", "bottom"). */
  here: number;
  labels: string[];
  /** Every setting's choices on every pose of the clip, and where they put the point on screen. */
  candidates: Candidates[];
  tracks: Track[];
  /** Where the pointer's travel is counted from (the press, or further out after a release past an end). */
  start: ScreenXY;
  last: ScreenXY;
  choice: DragChoice | null;
  replaces: string | null;
  said: string;
};

/** What the last release past the end of a setting left over, for the next drag of the same point. */
type Carry = { id: PointId; poses: unknown; key: string; keyframe: number; end: ScreenXY; over: ScreenXY; at: number };

/** A carried overshoot counts only for a drag of the same point started this soon after the release (ms), on the poses that release made. */
const CARRY_MS = 60000;
/** ...and only while the point is still drawn where the release left it (the camera has not moved): CSS pixels. */
const CARRY_SPOT_PX = 12;

/** How long the body glides into the committed pose after a release (ms). */
const SETTLE_MS = 320;

const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * A drag in Exercise mode, on the stage: at the press, the dragged point's place is worked out for
 * every choice of every setting of the template (a handful of solves); while dragging, the pointer
 * picks the setting and how far along it the body is drawn, and the drawn pose glides there; the
 * release applies the nearest choice to every pose, as one undo step. If no setting moves the
 * point in this pose another pose is tried, and if none does the stage says so and offers Limb.
 */
export function createExerciseDrag(session: PoseSession, view: () => View) {
  let active: Active | null = null;
  /** The pose the stage draws instead of the store's, and where it glides to (null: back to the store's). */
  let shown: Drawn | null = null;
  let goal: Drawn | null = null;
  let settleLeft = 0;
  let last = 0;
  let carry: Carry | null = null;

  const status = (next: ExerciseStatus | null) => poseStage.layer?.exercise(next);

  const ctxFor = (stance: PoseAngles, edit: { grip: string | null }): SolveContext => ({ twoHanded: false, grip: edit.grip, sockets: view().sockets, stance });

  /** The screen tracks of `id` for every setting on every pose of the clip (a handful of solves, once per drag). */
  const tracksOf = (exercise: TemplateExercise, from: TemplateParams, count: number, here: number, id: PointId, grip: string | null) => {
    const { camera, size } = view();
    // The pose on the stage first: a setting that moves the point as much on another pose does not take the stage there.
    const order = [here, ...Array.from({ length: count }, (_, k) => k).filter((k) => k !== here)];
    const candidates = order.map((k) => dragCandidates(exercise, from, k)).flat();
    const tracks: Track[] = candidates.map((c) => ({
      key: c.key,
      keyframe: c.keyframe,
      values: c.values,
      current: c.current,
      screen: c.poses.map((pose, i) => {
        const p = session.solve(pose, ctxFor(c.stances[i], { grip })).points[id];
        return (p && toScreen(camera, p, size.width, size.height)) ?? { x: NaN, y: NaN };
      }),
    }));
    return { candidates, tracks: tracks.filter((t) => t.screen.every((p) => Number.isFinite(p.x))) };
  };

  const candidateOf = (a: Active, c: DragChoice | null) => (c ? a.candidates.find((x) => x.key === c.key && x.keyframe === c.keyframe) : undefined);

  const describe = (a: Active): ExerciseStatus => {
    const c = a.choice;
    const candidate = candidateOf(a, c);
    return {
      kind: "live",
      id: a.id,
      setting: c ? SETTING_LABEL[c.key] : null,
      value: c ? valueLabel(c.value) : null,
      options: candidate ? candidate.values.map(valueLabel) : [],
      index: c?.index ?? -1,
      changed: Boolean(c && candidate && c.index !== candidate.current),
      off: Boolean(c?.off),
      limit: Boolean(c?.limit),
      pose: c && c.keyframe !== a.here ? (a.labels[c.keyframe] ? `the ${a.labels[c.keyframe]} pose` : `pose ${c.keyframe + 1}`) : null,
      replaces: a.replaces,
    };
  };

  return {
    get active() {
      return active !== null;
    },
    /** Starts a drag if Exercise mode is on; false leaves it to the limb drag. */
    begin(id: PointId, at: ScreenXY): boolean {
      const now = dragModeNow();
      const edit = useStudioStore.getState().poseEdit;
      if (now.mode !== "exercise" || !now.exercise || !edit) return false;
      const from = draftParams(now.exercise, edit);
      const built = buildTemplate(now.exercise, from);
      const here = Math.min(edit.keyframe, built.poses.length - 1);
      // Every pose of the clip: hips pulled down on the standing pose follow the depth of the bottom one.
      const { candidates, tracks } = tracksOf(now.exercise, from, built.poses.length, here, id, edit.grip);
      if (!usefulTracks(tracks).length) {
        // Nothing to follow: say so instead of doing nothing.
        active = null;
        status({ kind: "none", id, label: POINT_LABEL[id] });
        return true;
      }
      // Right after a release past the end of a setting, the same point picks up where the pointer was.
      const c = carry;
      carry = null;
      const track = c && c.id === id && c.poses === edit.poses && performance.now() - c.at < CARRY_MS ? tracks.find((t) => t.key === c.key && t.keyframe === c.keyframe) : undefined;
      const sameSpot = track && Math.hypot(track.screen[track.current].x - c!.end.x, track.screen[track.current].y - c!.end.y) < CARRY_SPOT_PX;
      const start = carriedStart(at, sameSpot ? c!.over : null);
      active = { id, exercise: now.exercise, from, here, labels: built.labels, candidates, tracks, start, last: at, choice: null, replaces: replacesNote(now.replaced), said: "" };
      // The drawn pose starts as the one on the stage and glides to the template's (the same unless the poses were edited by hand).
      const first = candidates.find((c) => c.keyframe === here)!;
      shown = { pose: edit.poses[Math.min(edit.keyframe, edit.poses.length - 1)], stance: edit.poses[0] };
      goal = poseAlong(first, first.current);
      settleLeft = 0;
      last = performance.now();
      status(describe(active));
      return true;
    },
    move(at: ScreenXY) {
      const a = active;
      if (!a) return;
      a.last = at;
      a.choice = chooseSetting(a.tracks, a.start, at, a.choice);
      const c = a.choice;
      const candidate = candidateOf(a, c);
      if (c && candidate) {
        goal = poseAlong(candidate, c.off ? candidate.current : c.t);
        // The pose the setting shows on is the one held (the strip in the side panel follows).
        const state = useStudioStore.getState();
        if (state.poseEdit && state.poseEdit.keyframe !== c.keyframe && c.keyframe < state.poseEdit.poses.length) state.setPoseKeyframe(c.keyframe);
      }
      const next = describe(a);
      const key = JSON.stringify(next);
      if (key !== a.said) {
        a.said = key;
        status(next);
      }
    },
    /** Applies the nearest choice to every pose (one undo step), or leaves the poses as they were. */
    end(): void {
      const a = active;
      active = null;
      // A press that found nothing to follow keeps its message up (with the way to Limb) until the next press.
      if (!a) return;
      const c = a.choice;
      const candidate = candidateOf(a, c);
      const next = c && candidate && !c.off && c.index !== candidate.current ? candidate.params[c.index] : null;
      const result = next ? applyTemplateSettings(a.exercise, next, c!.keyframe) : null;
      if (!result?.changed) useStudioStore.getState().setPoseKeyframe(a.here);
      // Released past the end of the setting: the next drag of this point counts the rest of the way.
      const track = c ? a.tracks.find((t) => t.key === c.key && t.keyframe === c.keyframe) : undefined;
      const over = c && track ? overshootOf(track, a.start, a.last, c) : null;
      carry = over && c && track ? { id: a.id, poses: useStudioStore.getState().poseEdit?.poses, key: c.key, keyframe: c.keyframe, end: track.screen[c.index], over, at: performance.now() } : null;
      goal = null;
      settleLeft = SETTLE_MS;
      poseStage.layer?.exerciseDone({ id: a.id, result, setting: c ? SETTING_LABEL[c.key] : null, value: c ? valueLabel(c.value) : null });
      status(null);
    },
    /**
     * The pose to draw this frame instead of the store's (eased towards where the drag asks, then
     * back onto the store's pose after a release), or null to draw the store's.
     */
    frame(store: Drawn): Drawn | null {
      if (!shown) return null;
      const t = performance.now();
      const dt = t - last;
      last = t;
      const target = goal ?? store;
      const u = easeStep(dt, reducedMotion());
      shown = { pose: easePose(shown.pose, target.pose, u), stance: easePose(shown.stance, target.stance, u) };
      if (!goal) {
        settleLeft -= dt;
        if (settleLeft <= 0 || (closeTo(shown.pose, store.pose) && closeTo(shown.stance, store.stance))) {
          shown = null;
          return null;
        }
      }
      return shown;
    },
    cancel() {
      active = null;
      shown = null;
      goal = null;
      status(null);
    },
  };
}

export type ExerciseDrag = ReturnType<typeof createExerciseDrag>;
