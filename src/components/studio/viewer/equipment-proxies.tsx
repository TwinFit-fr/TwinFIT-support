"use client";

import { Component, Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { studioAssetHeaders } from "@/lib/studio/asset-auth";
import type { EquipmentItem, EquipmentPlacement } from "@/lib/studio/types";

/* The equipment of a movement, drawn in the avatar's hands (sockets) or on the floor: the
   generated model of the code when one is in use (animation_studio.equipment_models), else
   stand-in geometry. Everything is in metres. */

/** Floor slot of the n-th support: in front of the avatar, one behind the other. */
export function supportSlotZ(index: number): number {
  return -0.1 - index * 0.5;
}

/**
 * A generated .glb scaled to its placement: the longest dimension becomes size_m, a load is
 * centred on the socket, a support stands on the floor. Mutates its own clone only.
 */
/** The same grip in the other hand: mirror across the body's sagittal plane. */
export function mirrorPlacement(p: EquipmentPlacement): EquipmentPlacement {
  const [ox, oy, oz] = p.offset ?? [0, 0, 0];
  const [rx, ry, rz] = p.rotation ?? [0, 0, 0];
  return { ...p, offset: [-ox, oy, oz], rotation: [rx, -ry, -rz] };
}

function GeneratedModel({
  url,
  kind,
  placement,
  slotZ,
  alignLongAxis = false,
  editRef,
  mirrored = false,
}: {
  url: string;
  kind: EquipmentItem["kind"];
  placement: EquipmentPlacement;
  /** Floor slot of a support (see supportSlotZ); 0 for a load, which sits on its socket. */
  slotZ: number;
  /** Turn the model so its longest side runs along X (a two-handed item, hand to hand). */
  alignLongAxis?: boolean;
  /** Set by the rig editor on its target: the placement group the gizmo moves. */
  editRef?: (o: THREE.Object3D | null) => void;
  /** The item sits in the left hand: the placement, defined for the right hand, is mirrored. */
  mirrored?: boolean;
}) {
  const { scene } = useGLTF(url, true, true, (loader) => loader.setRequestHeader(studioAssetHeaders(url)));
  const object = useMemo(() => {
    const clone = scene.clone(true);
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.setScalar(1);
    clone.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(clone);
    let size = box.getSize(new THREE.Vector3());
    if (alignLongAxis) {
      if (size.z > size.x && size.z >= size.y) clone.rotation.set(0, Math.PI / 2, 0);
      else if (size.y > size.x && size.y > size.z) clone.rotation.set(0, 0, Math.PI / 2);
      clone.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(clone);
      size = box.getSize(new THREE.Vector3());
    }
    const longest = Math.max(size.x, size.y, size.z, 1e-6);
    const scale = placement.size_m / longest;
    clone.scale.setScalar(scale);
    clone.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(clone);
    const center = scaled.getCenter(new THREE.Vector3());
    clone.position.set(-center.x, kind === "support" ? -scaled.min.y : -center.y, -center.z);
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return clone;
  }, [scene, kind, placement.size_m, alignLongAxis]);
  const effective = useMemo(() => (mirrored ? mirrorPlacement(placement) : placement), [placement, mirrored]);
  const rotation = useMemo(
    () => new THREE.Euler(...((effective.rotation ?? [0, 0, 0]).map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number])),
    [effective.rotation],
  );
  // Outer group: the floor slot of a support. Inner group: the placement (offset, rotation) relative
  // to the socket or the slot, which is what the rig editor moves.
  return (
    <group position={[0, 0, slotZ]}>
      <group ref={editRef} position={effective.offset ?? [0, 0, 0]} rotation={rotation}>
        <primitive object={object} />
      </group>
    </group>
  );
}

/** A model that fails to load falls back to the proxy, for this url, until the url changes. */
class ProxyBoundary extends Component<{ fallback: React.ReactNode; resetKey: string; children: React.ReactNode }, { failed: string | null }> {
  state = { failed: null as string | null };
  static getDerivedStateFromError() {
    return {};
  }
  componentDidCatch() {
    this.setState({ failed: this.props.resetKey });
  }
  render() {
    return this.state.failed === this.props.resetKey ? this.props.fallback : this.props.children;
  }
}

/** The mesh of one item: its generated model when there is one in use, else the proxy. */
export function EquipmentMesh({
  item,
  index,
  model,
  alignLongAxis = false,
  editRef,
  mirrored = false,
}: {
  item: EquipmentItem;
  index: number;
  model: { url: string; placement: EquipmentPlacement } | undefined;
  /** The item is held with both hands: its longest side runs along X (see BilateralAttachment). */
  alignLongAxis?: boolean;
  editRef?: (o: THREE.Object3D | null) => void;
  mirrored?: boolean;
}) {
  // The proxies place themselves (a support at its floor slot), so they work as fallbacks as they are.
  const proxy = item.kind === "load" ? <LoadProxy item={item} /> : <SupportProxy item={item} index={index} />;
  if (!model) return proxy;
  return (
    <ProxyBoundary fallback={proxy} resetKey={model.url}>
      <Suspense fallback={proxy}>
        <GeneratedModel
          url={model.url}
          kind={item.kind}
          placement={model.placement}
          slotZ={item.kind === "support" ? supportSlotZ(index) : 0}
          alignLongAxis={alignLongAxis}
          editRef={mirrored ? undefined : editRef}
          mirrored={mirrored}
        />
      </Suspense>
    </ProxyBoundary>
  );
}

const METAL = { color: "#aab4c3", metalness: 0.85, roughness: 0.3 } as const;
const RUBBER = { color: "#2a2f3a", metalness: 0.1, roughness: 0.9 } as const;
const PAD = { color: "#3a3f4b", metalness: 0.05, roughness: 0.85 } as const;

function Dumbbell() {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.016, 0.016, 0.3, 16]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {[-0.12, 0.12].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <cylinderGeometry args={[0.065, 0.065, 0.05, 24]} />
          <meshStandardMaterial {...RUBBER} />
        </mesh>
      ))}
    </group>
  );
}

function Kettlebell() {
  return (
    <group>
      <mesh position={[0, -0.09, 0]} castShadow>
        <sphereGeometry args={[0.1, 24, 16]} />
        <meshStandardMaterial {...RUBBER} />
      </mesh>
      <mesh rotation={[0, 0, 0]} castShadow>
        <torusGeometry args={[0.07, 0.014, 12, 24, Math.PI]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
    </group>
  );
}

function Barbell() {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.014, 0.014, 2.2, 16]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {[-0.85, 0.85].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.04, 32]} />
          <meshStandardMaterial {...RUBBER} />
        </mesh>
      ))}
    </group>
  );
}

function Band() {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.18, 0.012, 10, 40]} />
      <meshStandardMaterial color="#7fe0c4" roughness={0.6} />
    </mesh>
  );
}

/** A load item held at a socket: the mesh is drawn around the socket origin. */
export function LoadProxy({ item }: { item: EquipmentItem }) {
  switch (item.code) {
    case "DUMBBELL":
      return <Dumbbell />;
    case "KETTLEBELL":
      return <Kettlebell />;
    case "BARBELL":
    case "EZ_BAR":
      return <Barbell />;
    case "BAND":
      return <Band />;
    default:
      return (
        <mesh castShadow>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      );
  }
}

/** A support item placed on the floor, in front of or under the avatar. */
export function SupportProxy({ item, index }: { item: EquipmentItem; index: number }) {
  const z = supportSlotZ(index);
  switch (item.code) {
    case "BENCH":
    case "INCLINE_BENCH":
      return (
        <group position={[0, 0, z]}>
          <mesh position={[0, 0.42, 0]} receiveShadow castShadow>
            <boxGeometry args={[0.3, 0.06, 1.25]} />
            <meshStandardMaterial {...PAD} />
          </mesh>
          {[-0.5, 0.5].map((dz) => (
            <mesh key={dz} position={[0, 0.2, dz]} castShadow>
              <boxGeometry args={[0.26, 0.4, 0.05]} />
              <meshStandardMaterial {...METAL} />
            </mesh>
          ))}
        </group>
      );
    case "STEP":
    case "BOX":
      return (
        <mesh position={[0, 0.15, z - 0.3]} castShadow receiveShadow>
          <boxGeometry args={[0.7, 0.3, 0.4]} />
          <meshStandardMaterial {...PAD} />
        </mesh>
      );
    case "MAT":
      return (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[0.7, 1.9]} />
          <meshStandardMaterial color="#1d4b5f" roughness={0.95} />
        </mesh>
      );
    default:
      return (
        <mesh position={[0, 0.5, z - 0.6]}>
          <boxGeometry args={[0.6, 1, 0.08]} />
          <meshStandardMaterial {...PAD} transparent opacity={0.55} />
        </mesh>
      );
  }
}
