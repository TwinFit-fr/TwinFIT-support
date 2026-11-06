"use client";

import { Component, Fragment, Suspense, useEffect, useMemo } from "react";
import { Canvas, createPortal, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  useGLTF,
  useProgress,
} from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStudioStore, type CameraPreset } from "@/lib/studio/store";
import type { AvatarSocket, EquipmentItem } from "@/lib/studio/types";
import { LoadProxy, SupportProxy } from "./equipment-proxies";
import { recordCanvasCommit } from "./render-stats";

export type SceneProps = {
  modelUrl: string | null;
  heightM: number | null;
  sockets: AvatarSocket[];
  clip: THREE.AnimationClip | null;
  onModelInfo?: (info: ModelInfo | null) => void;
  /** Loading progress of the model (0-100) while a load is in flight, null when idle. */
  onProgress?: (progress: number | null) => void;
  /** The model failed to load (message), or loads again (null). */
  onError?: (message: string | null) => void;
};

export type ModelInfo = {
  bones: number;
  meshes: number;
  animations: string[];
  heightM: number;
  missingSockets: string[];
};

const CAMERA: Record<CameraPreset, [number, number, number]> = {
  front: [0, 1.35, 4.4],
  "three-quarter": [3.1, 1.75, 3.5],
  side: [4.6, 1.3, 0.2],
};
const TARGET = new THREE.Vector3(0, 0.95, 0);

/** Applies the camera preset whenever it (or the reset counter) changes; the user orbits freely in between. */
function CameraRig() {
  const preset = useStudioStore((s) => s.cameraPreset);
  const nonce = useStudioStore((s) => s.viewNonce);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    camera.position.set(...CAMERA[preset]);
    camera.lookAt(TARGET);
    if (controls) {
      controls.target.copy(TARGET);
      controls.update();
    }
  }, [preset, nonce, camera, controls]);
  return null;
}

type Attachment = { item: EquipmentItem; bone: THREE.Object3D; offset: THREE.Vector3; quaternion: THREE.Quaternion; scale: number };

function socketTransform(socket: AvatarSocket | undefined) {
  const offset = new THREE.Vector3(...(socket?.offset ?? [0, 0, 0]));
  const quaternion = new THREE.Quaternion();
  const r = socket?.rotation;
  if (r?.length === 4) quaternion.set(r[0], r[1], r[2], r[3]);
  else if (r?.length === 3)
    quaternion.setFromEuler(new THREE.Euler(...(r.map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number])));
  return { offset, quaternion };
}

function AvatarModel({ modelUrl, heightM, sockets, clip, onModelInfo }: SceneProps & { modelUrl: string }) {
  const { scene, animations } = useGLTF(modelUrl);
  const model = useMemo(() => cloneSkeleton(scene), [scene]);
  const items = useStudioStore((s) => s.previewItems);
  const showEquipment = useStudioStore((s) => s.showEquipment);

  // Ground the model, centre it and bring it to metres (Mixamo exports are often in centimetres).
  // The three object is mutated in place: it is scene state, not React state.
  const info = useMemo<ModelInfo>(() => {
    model.position.set(0, 0, 0);
    model.scale.setScalar(1);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const rawHeight = Math.max(size.y, 1e-6);
    const scale = heightM ? heightM / rawHeight : rawHeight > 10 ? 0.01 : 1;
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(model);
    const center = scaled.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -scaled.min.y, -center.z);
    model.updateMatrixWorld(true);
    let bones = 0;
    let meshes = 0;
    model.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Bone).isBone) bones += 1;
      if ((o as THREE.Mesh).isMesh) {
        meshes += 1;
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    return {
      bones,
      meshes,
      animations: animations.map((a) => a.name),
      heightM: rawHeight * scale,
      missingSockets: sockets.filter((s) => !model.getObjectByName(s.bone)).map((s) => s.id),
    };
  }, [model, heightM, sockets, animations]);

  useEffect(() => {
    onModelInfo?.(info);
    return () => onModelInfo?.(null);
  }, [info, onModelInfo]);

  // Resolve each load item to the bone of its socket (or the model root when the bone is missing).
  const attachments = useMemo<Attachment[]>(
    () =>
      items
        .filter((item) => item.kind === "load")
        .map((item) => {
          const socket = sockets.find((s) => s.id === item.socket);
          const bone = (socket && model.getObjectByName(socket.bone)) || model;
          const { offset, quaternion } = socketTransform(socket);
          const worldScale = bone.getWorldScale(new THREE.Vector3()).x || 1;
          return { item, bone, offset, quaternion, scale: 1 / worldScale };
        }),
    // info changes whenever the model was re-laid out, which moves the bones' world scale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, sockets, model, info],
  );

  // Play the selected clip, else the model's own first animation.
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  useEffect(() => {
    const active = clip ?? animations[0] ?? null;
    if (!active) return;
    const action = mixer.clipAction(active);
    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    return () => {
      action.stop();
      mixer.uncacheAction(active);
      mixer.uncacheClip(active);
    };
  }, [mixer, clip, animations]);
  // Playback controls are read straight from the store every frame: toggling them never re-renders the scene.
  useFrame((_, delta) => {
    const { playing, speed } = useStudioStore.getState();
    if (playing) mixer.update(delta * speed);
  });

  const supports = items.filter((i) => i.kind === "support");

  return (
    <>
      <primitive object={model} />
      {showEquipment
        ? attachments.map((a, i) => (
            // The key belongs to the element in this list (the portal), not to the group inside it.
            <Fragment key={`${a.item.code}-${a.item.socket ?? "root"}-${i}`}>
              {createPortal(
                <group position={a.offset} quaternion={a.quaternion} scale={a.scale}>
                  <LoadProxy item={a.item} />
                </group>,
                a.bone,
              )}
            </Fragment>
          ))
        : null}
      {showEquipment ? supports.map((item, i) => <SupportProxy key={`${item.code}-${i}`} item={item} index={i} />) : null}
    </>
  );
}

/** Reports the loading manager's progress to the DOM overlay; renders nothing in the scene. */
function LoadReporter({ onProgress }: { onProgress?: (progress: number | null) => void }) {
  const { active, progress } = useProgress();
  useEffect(() => {
    onProgress?.(active ? progress : null);
  }, [active, progress, onProgress]);
  return null;
}

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

function Floor() {
  const showGrid = useStudioStore((s) => s.showGrid);
  return (
    <>
      {showGrid ? (
        <Grid
          position={[0, 0.001, 0]}
          args={[20, 20]}
          cellSize={0.25}
          cellThickness={0.6}
          cellColor="#263041"
          sectionSize={1}
          sectionThickness={1.1}
          sectionColor="#3b4a66"
          fadeDistance={14}
          fadeStrength={1.4}
          infiniteGrid
        />
      ) : null}
      <ContactShadows position={[0, 0, 0]} opacity={0.55} scale={6} blur={2.2} far={2.5} resolution={512} color="#000000" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color="#0b0e14" roughness={1} metalness={0} />
      </mesh>
    </>
  );
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
      camera={{ position: CAMERA["three-quarter"], fov: 38, near: 0.05, far: 100 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.fog = new THREE.Fog("#090b10", 9, 18);
      }}
      className="h-full w-full"
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
        minDistance={0.8}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2 - 0.02}
        target={TARGET}
      />
      <CameraRig />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport axisColors={["#ff6b81", "#7fe0c4", "#7fa6ff"]} labelColor="#e3e7f0" />
      </GizmoHelper>
    </Canvas>
  );
}
