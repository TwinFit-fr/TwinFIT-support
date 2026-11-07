"use client";

import { Component, Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Canvas, createPortal, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  TransformControls,
  useGLTF,
  useProgress,
} from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { isPoseClipJson, poseClipFromDraft } from "@/lib/studio/anatomy";
import { DEFAULT_CLEANUP, cleanupClip } from "@/lib/studio/clip-cleanup";
import { isMocapClip, retargetToAvatar } from "@/lib/studio/mocap";
import { buildPoseClip, captureRestPose, probePose, type RestPose } from "@/lib/studio/pose-clip";
import { useStudioStore, type CameraPreset } from "@/lib/studio/store";
import type { AvatarSocket, EquipmentItem } from "@/lib/studio/types";
import type { LoadedClip } from "./movement-clip";
import { EquipmentMesh } from "./equipment-proxies";
import { equipmentKey } from "@/lib/studio/equipment";
import { recordCanvasCommit } from "./render-stats";

export type SceneProps = {
  modelUrl: string | null;
  heightM: number | null;
  sockets: AvatarSocket[];
  clip: LoadedClip | null;
  onModelInfo?: (info: ModelInfo | null) => void;
  /** Loading progress of the model (0-100) while a load is in flight, null when idle. */
  onProgress?: (progress: number | null) => void;
  /** The model failed to load (message), or loads again (null). */
  onError?: (message: string | null) => void;
  /** A pose clip could not be solved on this rig. */
  onClipError?: (message: string) => void;
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

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A two-handed item (barbell, plate): a world-space group kept, every frame, at the midpoint of
 * the two hand bones with its X axis running from one hand to the other. Not parented to a bone,
 * so the bones' scale does not reach the mesh.
 */
function BilateralAttachment({ a, b, children }: { a: THREE.Object3D; b: THREE.Object3D; children: React.ReactNode }) {
  const group = useMemo(() => new THREE.Group(), []);
  const pa = useMemo(() => new THREE.Vector3(), []);
  const pb = useMemo(() => new THREE.Vector3(), []);
  const x = useMemo(() => new THREE.Vector3(), []);
  const y = useMemo(() => new THREE.Vector3(), []);
  const z = useMemo(() => new THREE.Vector3(), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    a.getWorldPosition(pa);
    b.getWorldPosition(pb);
    group.position.addVectors(pa, pb).multiplyScalar(0.5);
    x.subVectors(pa, pb);
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
    x.normalize();
    z.crossVectors(x, UP);
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1);
    z.normalize();
    y.crossVectors(z, x).normalize();
    m.makeBasis(x, y, z);
    group.quaternion.setFromRotationMatrix(m);
  });
  return <primitive object={group}>{children}</primitive>;
}

function socketTransform(socket: AvatarSocket | undefined) {
  const offset = new THREE.Vector3(...(socket?.offset ?? [0, 0, 0]));
  const quaternion = new THREE.Quaternion();
  const r = socket?.rotation;
  if (r?.length === 4) quaternion.set(r[0], r[1], r[2], r[3]);
  else if (r?.length === 3)
    quaternion.setFromEuler(new THREE.Euler(...(r.map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number])));
  return { offset, quaternion };
}

function AvatarModel({ modelUrl, heightM, sockets, clip, onModelInfo, onClipError }: SceneProps & { modelUrl: string }) {
  const { scene, animations } = useGLTF(modelUrl);
  const model = useMemo(() => cloneSkeleton(scene), [scene]);
  const items = useStudioStore((s) => s.previewItems);
  const models = useStudioStore((s) => s.equipmentModels);
  const showEquipment = useStudioStore((s) => s.showEquipment);
  const cleanMocap = useStudioStore((s) => s.cleanMocap);
  // The pose editor's draft replaces the selected clip while it is open.
  const poseEdit = useStudioStore((s) => s.poseEdit);
  const draft = useMemo(() => (poseEdit ? poseClipFromDraft(poseEdit) : null), [poseEdit]);
  const holdTime = useMemo(() => {
    if (!poseEdit || !draft) return null;
    return draft.keyframes.find((k) => k.position === poseEdit.keyframe)?.t ?? 0;
  }, [poseEdit, draft]);

  // Ground the model, centre it and bring it to metres (Mixamo exports are often in centimetres).
  // The three object is mutated in place: it is scene state, not React state.
  const { info, rest } = useMemo<{ info: ModelInfo; rest: RestPose }>(() => {
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
      info: {
        bones,
        meshes,
        animations: animations.map((a) => a.name),
        heightM: rawHeight * scale,
        missingSockets: sockets.filter((s) => !model.getObjectByName(s.bone)).map((s) => s.id),
      },
      // The rest pose, taken now, before the mixer moves any bone: pose clips are solved against it.
      rest: captureRestPose(model),
    };
  }, [model, heightM, sockets, animations]);

  // Anatomical keyframes become a three.js clip for this very rig; a ready clip is used as it is.
  const [resolvedClip, clipError] = useMemo<[THREE.AnimationClip | null, string | null]>(() => {
    if (draft) {
      try {
        return [buildPoseClip(model, draft, rest, sockets), null];
      } catch (error) {
        return [null, error instanceof Error ? error.message : String(error)];
      }
    }
    if (!clip) return [null, null];
    try {
      if (isPoseClipJson(clip)) return [buildPoseClip(model, clip, rest, sockets), null];
      if (isMocapClip(clip)) {
        // Retargeting samples the avatar's bones: it needs them in their rest pose, as captured.
        model.traverse((o) => {
          if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.pose();
        });
        const { clip: retargeted, report } = retargetToAvatar(model, clip);
        if (report.unmatched.length && process.env.NODE_ENV !== "production") {
          console.info("[studio] mocap bones without an avatar bone:", report.unmatched.join(", "));
        }
        if (!cleanMocap) return [retargeted, null];
        const cleaned = cleanupClip(model, retargeted, rest, DEFAULT_CLEANUP);
        if (process.env.NODE_ENV !== "production") console.info("[studio] mocap clean-up:", cleaned.report);
        return [cleaned.clip, null];
      }
      return [clip, null];
    } catch (error) {
      return [null, error instanceof Error ? error.message : String(error)];
    }
  }, [clip, draft, model, rest, sockets, cleanMocap]);
  useEffect(() => {
    if (clipError) onClipError?.(clipError);
  }, [clipError, onClipError]);

  // The pose editor pins to where the held pose puts feet, hands and knees: computed off the rig.
  useEffect(() => {
    if (!poseEdit) return;
    const pose = poseEdit.poses[poseEdit.keyframe];
    if (!pose) return;
    try {
      useStudioStore.getState().setPoseProbe(probePose(model, rest, pose, { twoHanded: poseEdit.twoHanded, grip: poseEdit.grip, sockets }));
    } catch {
      // A rig without the legs or arms: nothing to pin.
    }
  }, [poseEdit, model, rest, sockets]);

  useEffect(() => {
    onModelInfo?.(info);
    return () => onModelInfo?.(null);
  }, [info, onModelInfo]);

  // The rig editor: drafts replace the saved sockets / placements while they are being moved.
  const edit = useStudioStore((s) => s.edit);
  const draftSockets = useStudioStore((s) => s.draftSockets);
  const draftPlacements = useStudioStore((s) => s.draftPlacements);
  const liveSockets = draftSockets ?? sockets;
  const modelFor = (kind: EquipmentItem["kind"], code: string) => {
    const key = equipmentKey(kind, code);
    const saved = models[key];
    if (!saved) return undefined;
    const draft = draftPlacements[key];
    return draft ? { ...saved, placement: draft } : saved;
  };
  const [editObject, setEditObject] = useState<THREE.Object3D | null>(null);
  // Stable callback ref: it is attached to the edit target only, so React calls it once per target change.
  const editRef = useCallback((o: THREE.Object3D | null) => setEditObject(o), []);

  // Items by the socket they hang from; bilateral items are drawn between two bones (see below).
  const { socketGroups, bilateral, rootItems } = useMemo(() => {
    const groups = new Map<string, { socket: AvatarSocket; bone: THREE.Object3D; scale: number; items: EquipmentItem[] }>();
    const bilateral: { item: EquipmentItem; bone: THREE.Object3D; boneB: THREE.Object3D }[] = [];
    const rootItems: EquipmentItem[] = [];
    const groupFor = (socket: AvatarSocket) => {
      let group = groups.get(socket.id);
      if (!group) {
        const bone = model.getObjectByName(socket.bone) || model;
        group = { socket, bone, scale: 1 / (bone.getWorldScale(new THREE.Vector3()).x || 1), items: [] };
        groups.set(socket.id, group);
      }
      return group;
    };
    // Every socket gets a group, so the editor can show and move the empty ones too.
    for (const socket of liveSockets) groupFor(socket);
    for (const item of items) {
      if (item.kind !== "load") continue;
      const socket = liveSockets.find((s) => s.id === item.socket);
      const socketB = item.socket_b ? liveSockets.find((s) => s.id === item.socket_b) : undefined;
      const bone = socket ? model.getObjectByName(socket.bone) : undefined;
      const boneB = socketB ? model.getObjectByName(socketB.bone) : undefined;
      if (bone && boneB && bone !== boneB) bilateral.push({ item, bone, boneB });
      else if (socket) groupFor(socket).items.push(item);
      else rootItems.push(item);
    }
    return { socketGroups: [...groups.values()], bilateral, rootItems };
    // info changes whenever the model was re-laid out, which moves the bones' world scale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, liveSockets, model, info]);

  // Play the selected clip, else the model's own first animation. Not while editing the rig: the
  // avatar stands in its bind pose so sockets are placed on a still body.
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const editing = edit.mode !== "off";
  useEffect(() => {
    if (editing) {
      mixer.stopAllAction();
      model.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.pose();
      });
      return;
    }
    const active = resolvedClip ?? animations[0] ?? null;
    if (!active) return;
    const action = mixer.clipAction(active);
    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    return () => {
      action.stop();
      mixer.uncacheAction(active);
      mixer.uncacheClip(active);
    };
  }, [mixer, model, resolvedClip, animations, editing]);
  // Playback controls are read straight from the store every frame: toggling them never re-renders the scene.
  useFrame((_, delta) => {
    const { playing, speed, edit } = useStudioStore.getState();
    if (edit.mode !== "off") return;
    if (playing) mixer.update(delta * speed);
    else if (holdTime !== null) mixer.setTime(holdTime); // the pose editor holds the selected pose
  });

  // The gizmo moved the target: write its transform (metres, degrees) into the draft.
  const commitEdit = () => {
    if (!editObject) return;
    const { edit, updateDraftSocket, setDraftPlacement } = useStudioStore.getState();
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    const r1 = (v: number) => Math.round(THREE.MathUtils.radToDeg(v) * 10) / 10;
    const offset: [number, number, number] = [r3(editObject.position.x), r3(editObject.position.y), r3(editObject.position.z)];
    const rotation: [number, number, number] = [r1(editObject.rotation.x), r1(editObject.rotation.y), r1(editObject.rotation.z)];
    if (edit.mode === "sockets" && edit.target) updateDraftSocket(sockets, edit.target, { offset, rotation });
    if (edit.mode === "model" && edit.target) {
      const [kind, code] = edit.target.split(":") as [EquipmentItem["kind"], string];
      const current = modelFor(kind, code)?.placement;
      if (current) setDraftPlacement(edit.target, { size_m: current.size_m, offset, rotation });
    }
  };

  const supports = items.filter((i) => i.kind === "support");
  const isModelTarget = (kind: EquipmentItem["kind"], code: string) => edit.mode === "model" && edit.target === equipmentKey(kind, code);

  return (
    <>
      <primitive object={model} />
      {socketGroups.map((g) => {
        const { offset, quaternion } = socketTransform(g.socket);
        const selected = edit.mode === "sockets" && edit.target === g.socket.id;
        const show = (showEquipment && g.items.length > 0) || edit.mode === "sockets";
        if (!show) return null;
        return (
          // The key belongs to the element in this list (the portal), not to the group inside it.
          <Fragment key={g.socket.id}>
            {createPortal(
              // Outer group: bone units → metres. Inner group: the socket itself (offset in metres,
              // rotation), which is what the gizmo moves in sockets mode.
              <group scale={g.scale}>
                <group ref={selected ? editRef : undefined} position={offset} quaternion={quaternion}>
                  {edit.mode === "sockets" ? <SocketMarker selected={selected} /> : null}
                  {showEquipment
                    ? g.items.map((item, i) => (
                        <EquipmentMesh
                          key={`${item.code}-${i}`}
                          item={item}
                          index={i}
                          model={modelFor("load", item.code)}
                          editRef={isModelTarget("load", item.code) ? editRef : undefined}
                          // A grip is defined for the right hand; the left hand gets its mirror image.
                          mirrored={g.socket.id === "hand_l" || /left/i.test(g.socket.bone)}
                        />
                      ))
                    : null}
                </group>
              </group>,
              g.bone,
            )}
          </Fragment>
        );
      })}
      {showEquipment
        ? bilateral.map((b, i) => (
            <BilateralAttachment key={`${b.item.code}-both-${i}`} a={b.bone} b={b.boneB}>
              <EquipmentMesh
                item={b.item}
                index={i}
                model={modelFor("load", b.item.code)}
                alignLongAxis
                editRef={isModelTarget("load", b.item.code) ? editRef : undefined}
              />
            </BilateralAttachment>
          ))
        : null}
      {showEquipment
        ? rootItems.map((item, i) => (
            <EquipmentMesh key={`${item.code}-root-${i}`} item={item} index={i} model={modelFor("load", item.code)} editRef={isModelTarget("load", item.code) ? editRef : undefined} />
          ))
        : null}
      {showEquipment
        ? supports.map((item, i) => (
            <EquipmentMesh
              key={`${item.code}-${i}`}
              item={item}
              index={i}
              model={modelFor("support", item.code)}
              editRef={isModelTarget("support", item.code) ? editRef : undefined}
            />
          ))
        : null}
      {editing && editObject ? (
        <TransformControls
          object={editObject}
          mode={edit.tool}
          space="local"
          size={0.7}
          rotationSnap={edit.snap ? Math.PI / 4 : null}
          translationSnap={edit.snap ? 0.005 : null}
          onMouseUp={commitEdit}
        />
      ) : null}
    </>
  );
}

/** Where a socket sits: a dot and its axes, drawn over everything while the rig is edited. */
function SocketMarker({ selected }: { selected: boolean }) {
  return (
    <group>
      <axesHelper args={[0.08]} />
      <mesh renderOrder={999}>
        <sphereGeometry args={[0.012, 12, 8]} />
        <meshBasicMaterial color={selected ? "#7fe0c4" : "#e3e7f0"} depthTest={false} transparent opacity={0.95} />
      </mesh>
    </group>
  );
}

/**
 * Reports the loading manager's progress to the DOM overlay; renders nothing in the scene.
 * It subscribes to drei's progress store outside React's render and defers each report, because
 * the store updates synchronously while a sibling (a model, an equipment GLB) is still rendering
 * and suspending; a hook subscription there would set state during another component's render.
 */
function LoadReporter({ onProgress }: { onProgress?: (progress: number | null) => void }) {
  useEffect(() => {
    let timer = 0;
    const emit = () => {
      const { active, progress } = useProgress.getState();
      onProgress?.(active ? progress : null);
    };
    const unsubscribe = useProgress.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(emit, 0);
    });
    emit();
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      onProgress?.(null);
    };
  }, [onProgress]);
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
