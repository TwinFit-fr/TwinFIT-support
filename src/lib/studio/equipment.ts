import type { EquipmentKind, EquipmentPlacement } from "./types";

export function equipmentKey(kind: EquipmentKind, code: string): string {
  return `${kind}:${code}`;
}

/** Size when a row has none (the service always writes one): a hand-held load, a floor support. */
const FALLBACK_SIZE_M: Record<EquipmentKind, number> = { load: 0.4, support: 1.2 };

/** Placement the viewer applies to a generated model: the row's params (size_m, offset, rotation). */
export function placementOf(kind: EquipmentKind, params: Record<string, unknown>): EquipmentPlacement {
  const size = typeof params.size_m === "number" && params.size_m > 0 ? params.size_m : FALLBACK_SIZE_M[kind];
  const offset = Array.isArray(params.offset) && params.offset.length === 3 ? (params.offset as [number, number, number]) : undefined;
  const rotation =
    Array.isArray(params.rotation) && params.rotation.length === 3 ? (params.rotation as [number, number, number]) : undefined;
  return { size_m: size, offset, rotation };
}
