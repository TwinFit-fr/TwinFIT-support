"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { isPointId } from "@/lib/studio/pose-points";
import {
  DEFAULT_VIEW,
  PART_POINTS,
  easeOutCubic,
  frameInStage,
  framingPoints,
  interpolatePose,
  matchView,
  normalize,
  orbitOf,
  positionOf,
  viewDirection,
  type CameraPose,
  type CameraViewId,
  type ScreenOffset,
  type Vec3,
} from "@/lib/studio/stage-camera";
import { useStageView, type ViewRequest } from "@/lib/studio/stage-view";
import { START_FOLLOW, followStep, type FollowState } from "@/lib/studio/stage-follow";
import { useStudioStore } from "@/lib/studio/store";
import { boundsOf, bodySurface, cornersOf, stageBody, stageObstacles } from "./stage-body";

/** How long a view change or a frame eases (instant with reduced motion). */
const EASE_MS = 360;
/** After an exercise opens, the camera keeps the body framed while its clip loads, until the user touches the stage. */
const FOLLOW_MS = 4000;
const FOLLOW_EVERY_MS = 150;
/** Before any model is there: a standing body. */
const STANDING: Vec3[] = [
  [-0.35, 0, -0.2],
  [0.35, 1.8, 0.2],
];
const BODY_PAD_M = 0.03;
const PART_PAD_M = 0.1;
/** A selected part is shown with at least this much around it (a hand with its forearm and some of the body). */
const PART_RADIUS_M = 0.38;
const MARGIN_PX = 14;
const FILL_INTENSITY = 0.75;

declare global {
  interface Window {
    /** Development aid for the capture scripts: where the stage camera is and what it does. */
    __studioCamera?: () => { position: Vec3; target: Vec3; offset: ScreenOffset; animating: boolean; following: boolean };
  }
}

type Rig = {
  anim: { from: CameraPose; to: CameraPose; start: number } | null;
  offset: ScreenOffset;
  /** What the body shows (exercise and stage version); a change starts a follow. */
  key: string;
  follow: { until: number; next: number; frames: number; state: FollowState } | null;
  framedOnce: boolean;
  /** Set while the controls exist (see the effect). */
  apply?: (pose: CameraPose) => void;
  setOffset?: (offset: ScreenOffset) => void;
  /** Fit these points from this direction, easing unless `instant` (or reduced motion). */
  frame?: (points: readonly Vec3[], direction: Vec3, pad: number, instant?: boolean, minRadiusM?: number) => void;
};

const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * The stage camera. Carries out the view requests of the toolbar, the keys and the axis widget
 * (stage-view.ts): turn to a named view, frame the body or the selected point's part from the
 * current side, reset. Every move eases around the body in a short time, and the body is drawn in
 * the free part of the stage, clear of the overlays: the orbit target is the body's centre and a
 * view offset of the camera puts it at the free part's centre, so orbiting keeps it there. When an
 * exercise opens (or another avatar or clip shows) the body is framed once it is drawn. Nothing
 * here re-renders React or touches the clip.
 */
export function CameraRig({ minDistance, maxDistance }: { minDistance: number; maxDistance: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const gl = useThree((s) => s.gl);
  const live = useRef<Rig>({ anim: null, offset: { x: 0, y: 0 }, key: "", follow: null, framedOnce: false });
  // A soft light from the camera: the back and the far side read as well as the front (the key light is front left).
  const fill = useMemo(() => new THREE.DirectionalLight("#ffffff", FILL_INTENSITY), []);

  useEffect(() => {
    if (!controls) return;
    const s = live.current;
    const size = () => {
      const r = gl.domElement.getBoundingClientRect();
      return { width: r.width || 1, height: r.height || 1 };
    };

    const setOffset = (offset: ScreenOffset) => {
      s.offset = offset;
      const { width, height } = size();
      if (Math.abs(offset.x) < 0.5 && Math.abs(offset.y) < 0.5) camera.clearViewOffset();
      else camera.setViewOffset(width, height, -offset.x, -offset.y, width, height);
    };
    const apply = (pose: CameraPose) => {
      controls.target.set(...pose.target);
      camera.position.set(...positionOf(pose));
      camera.lookAt(controls.target);
      // lookAt refreshed the world matrix before turning the camera: refresh it again, so the body
      // points projected later in this frame use the camera as it is drawn.
      camera.updateMatrixWorld();
      setOffset(pose.offset);
    };
    const current = (): CameraPose => {
      const t = controls.target;
      const d: Vec3 = [camera.position.x - t.x, camera.position.y - t.y, camera.position.z - t.z];
      return { target: [t.x, t.y, t.z], ...orbitOf(d), distance: Math.max(1e-3, Math.hypot(...d)), offset: s.offset };
    };
    const directionNow = (): Vec3 => normalize([camera.position.x - controls.target.x, camera.position.y - controls.target.y, camera.position.z - controls.target.z]);

    /** The selected body point's part (pose editor), from the held pose's probe; null without one. */
    const selectedPart = (): Vec3[] | null => {
      const st = useStudioStore.getState();
      const id = st.poseEdit?.dragTarget;
      if (!st.poseEdit || !isPointId(id)) return null;
      const pts = PART_POINTS[id].map((p) => st.poseProbe[p]).filter((p): p is [number, number, number] => Array.isArray(p));
      return pts.length ? pts : null;
    };

    // The controls keep easing out the user's last orbit or pan (damping): stop it where the camera
    // is now, or it would carry the camera off the view or the frame it is moving to. An update
    // without damping uses up what is left of it; the camera then goes back to where it was.
    const settleControls = () => {
      const position = camera.position.clone();
      const target = controls.target.clone();
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = damping;
      controls.target.copy(target);
      camera.position.copy(position);
      camera.lookAt(target);
    };

    const frame = (points: readonly Vec3[], direction: Vec3, pad: number, instant = false, minRadiusM = 0) => {
      settleControls();
      const to = frameInStage({ points, direction, fovYDeg: camera.fov, viewport: size(), padM: pad, marginPx: MARGIN_PX, minRadiusM, minDistance, maxDistance }, stageObstacles(gl.domElement));
      if (instant || reducedMotion()) {
        s.anim = null;
        apply(to);
      } else s.anim = { from: current(), to, start: performance.now() };
    };
    /** The whole body; a view also keeps room for the arms from above (framingPoints), Frame fits the body as it is. */
    const frameBody = (direction: Vec3, reach: boolean) => {
      const body = bodySurface();
      const points = body.length ? body : STANDING;
      frame(reach ? framingPoints(points, direction) : points, direction, BODY_PAD_M);
    };

    const handle = (req: ViewRequest) => {
      s.follow = null;
      const { setCurrent } = useStageView.getState();
      if (req.kind === "frame") {
        const part = selectedPart();
        const direction = directionNow();
        if (part) frame(part, direction, PART_PAD_M, false, PART_RADIUS_M);
        else frameBody(direction, false);
        return;
      }
      const view: CameraViewId = req.kind === "view" ? req.view : DEFAULT_VIEW;
      setCurrent(view);
      frameBody(viewDirection(view), true);
    };

    s.apply = apply;
    s.setOffset = setOffset;
    s.frame = frame;
    if (process.env.NODE_ENV !== "production") {
      const r3 = (v: number) => Math.round(v * 1000) / 1000;
      window.__studioCamera = () => ({
        position: [r3(camera.position.x), r3(camera.position.y), r3(camera.position.z)],
        target: [r3(controls.target.x), r3(controls.target.y), r3(controls.target.z)],
        offset: { ...s.offset },
        animating: s.anim !== null,
        following: s.follow !== null,
      });
    }

    const unsubscribe = useStageView.subscribe((state, prev) => {
      if (state.request && state.request !== prev.request) handle(state.request);
    });
    // Any press or wheel on the stage, or any key, is the user taking over: the follow stops.
    const frameEl = gl.domElement.closest(".stage-frame")?.parentElement ?? gl.domElement.parentElement;
    const stop = () => {
      s.follow = null;
    };
    const startOrbit = () => {
      s.follow = null;
      s.anim = null;
    };
    frameEl?.addEventListener("pointerdown", stop, true);
    frameEl?.addEventListener("wheel", stop, { capture: true, passive: true });
    window.addEventListener("keydown", stop, true);
    controls.addEventListener("start", startOrbit);
    return () => {
      unsubscribe();
      frameEl?.removeEventListener("pointerdown", stop, true);
      frameEl?.removeEventListener("wheel", stop, true);
      window.removeEventListener("keydown", stop, true);
      controls.removeEventListener("start", startOrbit);
      s.apply = undefined;
      s.setOffset = undefined;
      s.frame = undefined;
    };
  }, [camera, controls, gl, minDistance, maxDistance]);

  useFrame((state) => {
    const s = live.current;
    if (controls) {
      fill.position.copy(camera.position);
      fill.target.position.copy(controls.target);
    }
    if (!controls || !s.apply || !s.setOffset || !s.frame) return;
    // The view offset is in pixels of the canvas: keep it with the canvas's size.
    if (camera.view && (camera.view.fullWidth !== state.size.width || camera.view.fullHeight !== state.size.height)) s.setOffset(s.offset);

    const now = performance.now();
    if (s.anim) {
      const t = (now - s.anim.start) / EASE_MS;
      s.apply(interpolatePose(s.anim.from, s.anim.to, easeOutCubic(t)));
      if (t >= 1) s.anim = null;
      return;
    }

    // Which named view the camera is on (none once the user orbits away); the store ignores repeats.
    const d: Vec3 = [camera.position.x - controls.target.x, camera.position.y - controls.target.y, camera.position.z - controls.target.z];
    useStageView.getState().setCurrent(matchView(d));

    // A new body on the stage: frame it once it is drawn, and again while its clip arrives.
    const key = `${useStudioStore.getState().exerciseId ?? ""}|${stageBody.version}`;
    if (key !== s.key) {
      s.key = key;
      s.follow = stageBody.model ? { until: now + FOLLOW_MS, next: 0, frames: 0, state: START_FOLLOW } : null;
    }
    const f = s.follow;
    if (!f || !stageBody.model) return;
    if (now > f.until) {
      s.follow = null;
      return;
    }
    f.frames += 1;
    if (f.frames < 3 || now < f.next) return;
    f.next = now + FOLLOW_EVERY_MS;
    const body = bodySurface();
    const box = boundsOf(body);
    if (!box) return;
    const st = useStudioStore.getState();
    const moving = !st.poseEdit || st.playing || st.scrubTime !== null;
    const step = followStep(f.state, box, moving);
    f.state = step.state;
    if (!step.frame) return;
    // A held pose is framed by its surface; a moving body by everything it reached. The very first
    // framing after the model loads is instant, later ones ease.
    const direction = normalize(d);
    s.frame(framingPoints(step.frame === box ? body : cornersOf(step.frame), direction), direction, BODY_PAD_M, !s.framedOnce);
    s.framedOnce = true;
  });

  return (
    <>
      <primitive object={fill} />
      <primitive object={fill.target} />
    </>
  );
}
