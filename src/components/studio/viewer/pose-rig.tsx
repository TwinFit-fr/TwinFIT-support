"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { TransformControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import { useDragMode } from "@/lib/studio/drag-mode";
import type { RestPose, SolveContext } from "@/lib/studio/pose-clip";
import { dragPoint, mirrorApplies, settleDrag } from "@/lib/studio/pose-drag";
import { OUT_OF_REACH_PX, nudgeKeepsAim, nudgeMetres } from "@/lib/studio/pose-hit";
import { holdNearestKey } from "@/lib/studio/playback";
import { legNote } from "@/lib/studio/pose-legs";
import { POINT_LABEL, SKELETON_CHAINS, isPointId, metresPerPixel, mirrorPoint, nudgeOffset, pointerOnCameraPlane, toScreen, type NudgeKey, type PointId } from "@/lib/studio/pose-points";
import { createPoseSession, median, type PoseSession } from "@/lib/studio/pose-session";
import { useStudioStore, type PoseEditState } from "@/lib/studio/store";
import { poseName } from "@/lib/studio/timeline";
import type { AvatarSocket } from "@/lib/studio/types";
import { createExerciseDrag } from "./exercise-drag";
import { poseStage, type ScreenXY, type StageFrame } from "./pose-stage";

declare global {
  interface Window {
    /** Development only: solve timings of the pose editor, for the capture scripts. */
    __studioPoseStats?: () => { solves: number; probes: number; ticks: number; medianSolveMs: number | null; medianTickMs: number | null; recentTickMs: number[] };
  }
}

type Drag = {
  id: PointId;
  /** "pointer": dragged on the point, in the camera plane. "gizmo": along the axis gizmo. "keys": arrow keys. */
  by: "pointer" | "gizmo" | "keys";
  /** In the view plane, the body choosing the depth (the pointer, arrow keys); the gizmo and PageUp / PageDown are exact. */
  soft: boolean;
  /** Plane point and grab offset of a pointer drag (world). */
  through: THREE.Vector3;
  offset: THREE.Vector3;
  /** Next target to apply (world), consumed once per frame. */
  pending: THREE.Vector3 | null;
  /** Where the pointer last asked the point to be (world). */
  aim: THREE.Vector3 | null;
  moved: boolean;
};

function contextOf(edit: PoseEditState, sockets: AvatarSocket[]): SolveContext {
  return { twoHanded: edit.twoHanded, grip: edit.grip, sockets, stance: edit.poses[0] };
}

/** The view is not a held key pose (playing, or an in-between): a grab first holds the nearest key. */
const notHeld = () => {
  const s = useStudioStore.getState();
  return s.playing || s.scrubTime !== null;
};

/** Hold the key pose nearest the playhead, and say so (a grab between keys edits a real pose). */
function snapToNearestKey() {
  const pose = holdNearestKey();
  const edit = useStudioStore.getState().poseEdit;
  if (pose !== null && edit) poseStage.layer?.announce(`Now editing ${poseName(pose, edit.labels)}, the key pose nearest the playhead.`);
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The pose editor on the stage. Each frame (called by the avatar after its mixer): applies the
 * pending drag once, writes the held pose straight onto the bones from one cached solve, and
 * projects the body points and the stick figure for the DOM layer. The axis gizmo on the selected
 * point moves it along one axis or plane. Drag rules and solving live in src/lib/studio.
 */
export function PoseRig({
  model,
  rest,
  sockets,
  frameRef,
}: {
  model: THREE.Object3D;
  rest: RestPose;
  sockets: AvatarSocket[];
  frameRef: RefObject<(() => void) | null>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const session = useMemo<PoseSession>(() => createPoseSession(model, rest), [model, rest]);
  const editorOpen = useStudioStore((s) => Boolean(s.poseEdit) && s.edit.mode === "off");
  const selected = useStudioStore((s) => (s.poseEdit && isPointId(s.poseEdit.dragTarget) ? s.poseEdit.dragTarget : null));
  // Playing or on an in-between the gizmo steps aside: a grab first holds the nearest key pose.
  const moving = useStudioStore((s) => s.playing || s.scrubTime !== null);
  const limbMode = useDragMode().mode === "limb";
  const helper = useMemo(() => new THREE.Object3D(), []);
  const gizmo = useRef<TransformControlsImpl>(null);
  const drag = useRef<Drag | null>(null);
  const [gizmoDragging, setGizmoDragging] = useState(false);
  const [pointerDragging, setPointerDragging] = useState(false);
  const live = useRef({ size, camera, sockets });
  useEffect(() => {
    live.current = { size, camera, sockets };
  });

  // The points this avatar has, for the DOM layer; the dev timing hook for the capture scripts.
  useEffect(() => {
    poseStage.available = session.available;
    poseStage.layer?.setAvailable(session.available);
    if (process.env.NODE_ENV !== "production") {
      window.__studioPoseStats = () => ({
        solves: session.stats.solves,
        probes: session.stats.probes,
        ticks: session.stats.ticks,
        medianSolveMs: median(session.stats.solveMs),
        medianTickMs: median(session.stats.tickMs),
        recentTickMs: [...session.stats.tickMs],
      });
    }
    return () => {
      poseStage.available = [];
      poseStage.layer?.setAvailable([]);
    };
  }, [session]);

  useEffect(() => {
    const points: Partial<Record<PointId, THREE.Vector3>> = {};
    const scratch = new THREE.Vector3();
    const project = new THREE.Vector3();
    let probed: unknown = null;
    /** Where the last arrow-key nudge aimed (see nudgeFrom). */
    const aimed: { id: PointId | null; at: THREE.Vector3 | null } = { id: null, at: null };
    /** Exercise mode: a drag drives the template's settings (exercise-drag.ts); `byExercise` while one is held. */
    const exercise = createExerciseDrag(session, () => live.current);
    let byExercise = false;

    const toNdc = (at: ScreenXY) => ({ x: (at.x / live.current.size.width) * 2 - 1, y: 1 - (at.y / live.current.size.height) * 2 });

    /** One drag step: the rule makes the new pose, the store keeps it (one undo step per drag), the session solves it once. */
    const tick = (d: Drag, target: THREE.Vector3) => {
      const t0 = performance.now();
      const state = useStudioStore.getState();
      const edit = state.poseEdit;
      if (!edit) return;
      const pose = edit.poses[edit.keyframe];
      // A pointer or arrow-key drag keeps the point on its line of sight and lets the body choose its depth; the gizmo is exact.
      const view = d.soft ? target.clone().sub(live.current.camera.getWorldPosition(new THREE.Vector3())).normalize() : undefined;
      const next = dragPoint(session, pose, contextOf(edit, live.current.sockets), d.id, target, { mirror: edit.mirror, view });
      if (next !== pose) state.updatePose(edit.keyframe, next, true);
      const after = useStudioStore.getState().poseEdit!;
      session.solve(after.poses[after.keyframe], contextOf(after, live.current.sockets));
      session.recordTick(performance.now() - t0);
    };

    const pointNow = (id: PointId) => {
      session.readPoints(points);
      return points[id]?.clone() ?? null;
    };

    /** Selects the point and holds its pose: a grab during playback or on an in-between holds the nearest key pose. */
    const hold = (id: PointId) => {
      const state = useStudioStore.getState();
      if (!state.poseEdit) return;
      if (notHeld()) snapToNearestKey();
      useStudioStore.getState().setPoseDragTarget(id);
    };

    /** What there is to say about how this point moves (a standing body's legs), for the status near the stage. */
    const noteFor = (id: PointId) => {
      const edit = useStudioStore.getState().poseEdit;
      return edit ? legNote(session, edit.poses[edit.keyframe], contextOf(edit, live.current.sockets), id, edit.mirror) : null;
    };

    const finish = () => {
      if (byExercise) {
        byExercise = false;
        exercise.end();
        poseStage.layer?.setDragging(null);
        setPointerDragging(false);
        return;
      }
      const d = drag.current;
      if (!d) return;
      if (d.pending) {
        tick(d, d.pending);
        d.pending = null;
        d.moved = true;
      }
      drag.current = null;
      const state = useStudioStore.getState();
      const edit = state.poseEdit;
      if (d.moved && edit) {
        // Still inside the gesture: a leg that was moved settles (a foot back where it stood carries the body again).
        const pose = edit.poses[edit.keyframe];
        const settled = settleDrag(session, pose, contextOf(edit, live.current.sockets), d.id);
        if (settled !== pose) state.updatePose(edit.keyframe, settled, true);
      }
      state.endPoseGesture();
      poseStage.layer?.setDragging(null);
      if (d.by === "pointer") setPointerDragging(false);
      if (d.moved && edit) {
        const mirror = edit.mirror && mirrorApplies(edit.poses[edit.keyframe], d.id) ? mirrorPoint(d.id) : null;
        poseStage.layer?.announce(`${POINT_LABEL[d.id]} moved${mirror ? `, ${POINT_LABEL[mirror].toLowerCase()} mirrored` : ""}. Undo with Ctrl+Z.`);
      }
    };

    poseStage.scene = {
      beginDrag(id, at) {
        const wasPlaying = notHeld();
        hold(id);
        if (exercise.begin(id, at)) {
          byExercise = true;
          poseStage.layer?.setDragging(id, null);
          setPointerDragging(true);
          return;
        }
        let through = pointNow(id);
        if (wasPlaying) {
          // The held pose replaces the playing frame: grab the point where that pose puts it.
          const edit = useStudioStore.getState().poseEdit!;
          through = session.solve(edit.poses[edit.keyframe], contextOf(edit, live.current.sockets)).points[id]?.clone() ?? through;
        }
        if (!through) return;
        const hit = pointerOnCameraPlane(live.current.camera, toNdc(at), through);
        const offset = !wasPlaying && hit ? through.clone().sub(hit) : new THREE.Vector3();
        drag.current = { id, by: "pointer", soft: true, through, offset, pending: null, aim: null, moved: false };
        poseStage.layer?.setDragging(id, noteFor(id));
        setPointerDragging(true);
      },
      dragTo(at) {
        if (byExercise) {
          exercise.move(at);
          return;
        }
        const d = drag.current;
        if (!d || d.by !== "pointer") return;
        const hit = pointerOnCameraPlane(live.current.camera, toNdc(at), d.through);
        if (!hit) return;
        d.pending = hit.add(d.offset);
        d.aim = d.pending.clone();
      },
      endDrag: finish,
      nudge(id, key: NudgeKey, coarse) {
        if (!drag.current || drag.current.id !== id || drag.current.by !== "keys") {
          finish();
          hold(id);
          drag.current = { id, by: "keys", soft: true, through: new THREE.Vector3(), offset: new THREE.Vector3(), pending: null, aim: null, moved: false };
        }
        drag.current.soft = !key.startsWith("Page");
        // A few pixels on screen whatever the zoom, from the last aim while the body keeps up with
        // it, else from where the point is (pose-hit.ts).
        const now = pointNow(id);
        if (!now) return;
        const { camera: cam, size: box } = live.current;
        const mpp = metresPerPixel(cam, now, box.height);
        const step = nudgeMetres(mpp, coarse);
        const aim = aimed.id === id ? aimed.at : null;
        const at = toScreen(cam, now, box.width, box.height);
        const keep = aim !== null && at !== null && nudgeKeepsAim(at, toScreen(cam, aim, box.width, box.height), step / mpp);
        const base = drag.current.pending ?? (keep && aim ? aim : now);
        drag.current.pending = base.clone().add(nudgeOffset(cam, key, step));
        aimed.id = id;
        aimed.at = drag.current.pending.clone();
      },
      endNudge() {
        if (drag.current?.by === "keys") finish();
      },
      gizmoBusy: () => Boolean(drag.current?.by === "gizmo" || (gizmo.current as unknown as { axis: string | null } | null)?.axis),
    };

    frameRef.current = () => {
      const state = useStudioStore.getState();
      const edit = state.poseEdit;
      if (!edit || state.edit.mode !== "off") {
        poseStage.layer?.frame(null);
        return;
      }
      const d = drag.current;
      if (d?.pending) {
        tick(d, d.pending);
        d.pending = null;
        d.moved = true;
      }
      const now = useStudioStore.getState();
      const held = !now.playing && now.scrubTime === null;
      let solved = null;
      let preview = false;
      if (held && now.poseEdit) {
        const ctx = contextOf(now.poseEdit, live.current.sockets);
        const pose = now.poseEdit.poses[now.poseEdit.keyframe];
        // An Exercise-mode drag draws the body gliding between template poses until it settles on the store's.
        const drawn = exercise.frame({ pose, stance: now.poseEdit.poses[0] });
        preview = drawn !== null;
        solved = drawn ? session.solve(drawn.pose, { ...ctx, twoHanded: false, stance: drawn.stance }) : session.solve(pose, ctx);
        session.writeBones(solved);
      }
      session.readPoints(points);
      // The pins and the floor checks of the side panel read these: after a gesture, not on every frame of it.
      if (solved && !drag.current && !preview && probed !== solved) {
        probed = solved;
        const probe: Record<string, [number, number, number]> = {};
        for (const [id, p] of Object.entries(points)) probe[id] = [r3(p.x), r3(p.y), r3(p.z)];
        now.setPoseProbe(probe);
      }
      const sel = isPointId(now.poseEdit?.dragTarget) ? now.poseEdit.dragTarget : null;
      if (sel && points[sel] && drag.current?.by !== "gizmo") helper.position.copy(points[sel]!);
      const { width, height } = live.current.size;
      const cam = live.current.camera;
      const frame: StageFrame = { points: {}, chains: [] };
      for (const id of session.available) {
        const p = points[id];
        const xy = p ? toScreen(cam, p, width, height, project) : null;
        if (xy) frame.points[id] = xy;
      }
      for (const chain of SKELETON_CHAINS) {
        const line: ScreenXY[] = [];
        for (const joint of chain) {
          const p = session.joint(joint, scratch);
          const xy = p ? toScreen(cam, p, width, height, project) : null;
          if (xy) line.push(xy);
        }
        if (line.length > 1) frame.chains.push(line);
      }
      // A dragged point the body cannot bring under the pointer: show how far the pointer is.
      const pulled = drag.current;
      const from = pulled?.by === "pointer" && pulled.moved ? frame.points[pulled.id] : undefined;
      const to = from && pulled?.aim ? toScreen(cam, pulled.aim, width, height, project) : null;
      if (from && to && Math.hypot(to.x - from.x, to.y - from.y) > OUT_OF_REACH_PX) frame.short = { from, to };
      poseStage.layer?.frame(frame);
    };

    return () => {
      finish();
      exercise.cancel();
      frameRef.current = null;
      poseStage.scene = null;
      poseStage.layer?.frame(null);
    };
  }, [session, frameRef, helper]);

  // The axis gizmo is for constrained moves of the selected point; it steps aside while the point itself is dragged.
  // In Exercise mode a drag drives the settings: the gizmo (exact moves of one limb) is for Limb mode.
  const showGizmo = editorOpen && selected !== null && limbMode && !pointerDragging && (!moving || gizmoDragging);
  return (
    <>
      <primitive object={helper} />
      {showGizmo ? (
        <TransformControls
          ref={gizmo}
          object={helper}
          mode="translate"
          space="world"
          size={0.85}
          translationSnap={null}
          onMouseDown={() => {
            if (!selected) return;
            if (notHeld()) snapToNearestKey();
            drag.current = { id: selected, by: "gizmo", soft: false, through: new THREE.Vector3(), offset: new THREE.Vector3(), pending: null, aim: null, moved: false };
            poseStage.layer?.setDragging(selected, null);
            setGizmoDragging(true);
          }}
          onObjectChange={() => {
            if (drag.current?.by === "gizmo") drag.current.pending = helper.position.clone();
          }}
          onMouseUp={() => {
            poseStage.scene?.endDrag();
            setGizmoDragging(false);
          }}
        />
      ) : null}
    </>
  );
}
