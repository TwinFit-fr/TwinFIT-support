"use client";

import type { EquipmentItem } from "@/lib/studio/types";

/* Stand-in geometry for the equipment of a movement, drawn in the avatar's hands (sockets) or on
   the floor until real models exist. Everything is in metres. */

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
  const z = -0.1 - index * 0.5;
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
