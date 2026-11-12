"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Hud, OrthographicCamera, useCursor } from "@react-three/drei";
import * as THREE from "three";
import { viewOfAxis, type Vec3 } from "@/lib/studio/stage-camera";
import { useStageView } from "@/lib/studio/stage-view";
import { AXIS_WIDGET_PX } from "./stage-body";

const COLORS = { x: "#ff6b81", y: "#7fe0c4", z: "#7fa6ff" } as const;
const SCALE = 40;

function Arm({ color, rotation }: { color: string; rotation: [number, number, number] }) {
  return (
    <group rotation={rotation}>
      <mesh position={[0.4, 0, 0]}>
        <boxGeometry args={[0.8, 0.05, 0.05]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** One end of the widget: a disc (labelled on the positive ends) that turns the camera to look from there. */
function End({ axis, color, label }: { axis: Vec3; color: string; label?: string }) {
  const view = viewOfAxis(axis);
  const [hot, setHot] = useState(false);
  useCursor(hot && view !== null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(32, 32, 16, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    if (label) {
      ctx.font = "600 18px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#0b0e14";
      ctx.fillText(label, 32, 39);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [color, label]);
  return (
    <sprite
      position={axis as [number, number, number]}
      scale={(label ? 1 : 0.75) * (hot && view ? 1.25 : 1)}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (!view) return;
        setHot(true);
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHot(false);
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => e.stopPropagation()}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (view) useStageView.getState().showView(view);
      }}
    >
      <spriteMaterial map={texture} alphaTest={0.3} opacity={label ? 1 : 0.8} transparent toneMapped={false} />
    </sprite>
  );
}

/**
 * The axis widget in the stage's top-right corner. It turns with the camera; a click on an end
 * looks from that side (X is the avatar's left, Z its front, Y the top) through the same view
 * request as the toolbar and the keys, so it eases, frames the body and lights the view's button.
 */
export function AxisWidget() {
  const size = useThree((s) => s.size);
  const main = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    group.current?.quaternion.copy(main.quaternion).invert();
  });
  const half = AXIS_WIDGET_PX / 2;
  return (
    <Hud renderPriority={1}>
      <OrthographicCamera makeDefault position={[0, 0, 200]} />
      <group position={[size.width / 2 - half, size.height / 2 - half, 0]}>
        <group ref={group} scale={SCALE}>
          <Arm color={COLORS.x} rotation={[0, 0, 0]} />
          <Arm color={COLORS.y} rotation={[0, 0, Math.PI / 2]} />
          <Arm color={COLORS.z} rotation={[0, -Math.PI / 2, 0]} />
          <End axis={[1, 0, 0]} color={COLORS.x} label="X" />
          <End axis={[0, 1, 0]} color={COLORS.y} label="Y" />
          <End axis={[0, 0, 1]} color={COLORS.z} label="Z" />
          <End axis={[-1, 0, 0]} color={COLORS.x} />
          <End axis={[0, -1, 0]} color={COLORS.y} />
          <End axis={[0, 0, -1]} color={COLORS.z} />
        </group>
      </group>
    </Hud>
  );
}
