"use client";

import { Component, Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useStudioStore } from "@/lib/studio/store";
import { recordCanvasCommit } from "./render-stats";
import { AxisWidget } from "./axis-widget";
import { CameraRig } from "./camera-rig";
import { poseStage } from "./pose-stage";
import { AvatarModel } from "./avatar-model";
import { LoadReporter } from "./load-reporter";
import type { SceneProps } from "./scene-props";
import { Floor } from "./stage-floor";

export type { ModelInfo, SceneProps } from "./scene-props";

/** Where the camera starts, before the body is framed (camera-rig.tsx); the orbit limits. */
const START_CAMERA: [number, number, number] = [3.1, 1.75, 3.5];
const START_TARGET = new THREE.Vector3(0, 0.95, 0);
const MIN_DISTANCE = 0.6;
const MAX_DISTANCE = 12;

class ModelErrorBoundary extends Component<
  { children: React.ReactNode; resetKey: string | null; onError?: (message: string | null) => void },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown) {
    this.props.onError?.(error instanceof Error ? error.message : String(error));
  }
  componentDidUpdate(prev: { resetKey: string | null }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
      this.props.onError?.(null);
    }
  }
  render() {
    return this.state.error ? null : this.props.children;
  }
}

/** The r3f scene. Only store slices it draws can re-render it; the side panels never do. */
export default function StudioCanvas(props: SceneProps) {
  // Each commit of this component is counted for the HUD (development aid, see render-stats.ts).
  useEffect(() => {
    recordCanvasCommit();
  });
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: START_CAMERA, fov: 38, near: 0.05, far: 100 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.fog = new THREE.Fog("#090b10", 9, 18);
      }}
      className="h-full w-full"
      // A click on empty space (not a drag that orbited, not the axis gizmo) clears the selected body point.
      onPointerMissed={() => {
        const { poseEdit, edit, setPoseDragTarget } = useStudioStore.getState();
        if (!poseEdit?.dragTarget || edit.mode !== "off" || poseStage.scene?.gizmoBusy()) return;
        setPoseDragTarget(null);
        poseStage.layer?.announce("Selection cleared.");
      }}
    >
      <color attach="background" args={["#090b10"]} />
      <hemisphereLight args={["#aebbd6", "#0a0c12", 0.8]} />
      <directionalLight
        position={[3.5, 6, 4]}
        intensity={2.4}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <directionalLight position={[-4, 3, -3]} intensity={0.9} color="#7fa6ff" />
      <spotLight position={[0, 5, -4]} intensity={1.2} angle={0.6} penumbra={1} color="#7fe0c4" />

      <Floor />
      <LoadReporter onProgress={props.onProgress} />
      <ModelErrorBoundary resetKey={props.modelUrl} onError={props.onError}>
        <Suspense fallback={null}>
          {props.modelUrl ? <AvatarModel {...props} modelUrl={props.modelUrl} /> : null}
        </Suspense>
      </ModelErrorBoundary>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        maxPolarAngle={Math.PI / 2 - 0.02}
        target={START_TARGET}
      />
      <CameraRig minDistance={MIN_DISTANCE} maxDistance={MAX_DISTANCE} />
      {/* Top right, like an animation tool's view cube: the bottom of the stage stays free for the
          playback toolbar and the timeline dock. Its space is --studio-gizmo-reserve in the CSS. */}
      <AxisWidget />
    </Canvas>
  );
}
