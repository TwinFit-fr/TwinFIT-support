// The stage floor: the grid (when shown), contact shadows and the dark floor disc.
"use client";

import { ContactShadows, Grid } from "@react-three/drei";
import { useStudioStore } from "@/lib/studio/store";

export function Floor() {
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
