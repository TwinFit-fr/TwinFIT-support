import type { EquipmentKind, EquipmentPlacement } from "./types";

/**
 * Longest dimension, in metres, each catalog implement is scaled to in the viewer. Generated
 * meshes come in arbitrary units; the viewer measures the model's bounding box and scales it
 * to this size (params.size_m of the row overrides it).
 */
export const EQUIPMENT_SIZE_M: Record<EquipmentKind, Record<string, number>> = {
  load: {
    BAND: 0.6,
    BARBELL: 2.2,
    BICYCLE: 1.3,
    CABLE: 0.3,
    DIP_BELT: 0.5,
    DUMBBELL: 0.36,
    KETTLEBELL: 0.3,
    LANDMINE: 1.6,
    LEG_PRESS_MACHINE: 2.1,
    MACHINE: 1.9,
    PLATE: 0.45,
    SMITH_MACHINE: 2.2,
  },
  support: {
    BENCH: 1.3,
    DOUBLE_D_HANDLE: 0.22,
    HYPEREXTENSION_BENCH: 1.2,
    PARALLEL_BAR: 1.5,
    PULL_UP_BAR: 1.3,
    STEP: 0.9,
    TRICEP_ROPE: 0.4,
  },
};

const DEFAULT_SIZE_M: Record<EquipmentKind, number> = { load: 0.4, support: 1.2 };

export function defaultSizeM(kind: EquipmentKind, code: string): number {
  return EQUIPMENT_SIZE_M[kind][code] ?? DEFAULT_SIZE_M[kind];
}

export function equipmentKey(kind: EquipmentKind, code: string): string {
  return `${kind}:${code}`;
}

/** Placement the viewer applies to a generated model, with the size defaulted by code. */
export function placementOf(kind: EquipmentKind, code: string, params: Record<string, unknown>): EquipmentPlacement {
  const size = typeof params.size_m === "number" && params.size_m > 0 ? params.size_m : defaultSizeM(kind, code);
  const offset = Array.isArray(params.offset) && params.offset.length === 3 ? (params.offset as [number, number, number]) : undefined;
  const rotation =
    Array.isArray(params.rotation) && params.rotation.length === 3 ? (params.rotation as [number, number, number]) : undefined;
  return { size_m: size, offset, rotation };
}

/** Texture hint sent with every generation: the catalog look, without a background or a person. */
export function defaultTexturePrompt(kind: EquipmentKind, name: string): string {
  return kind === "load"
    ? `${name}: realistic gym equipment, clean studio materials, no background, no hands, no person`
    : `${name}: realistic gym equipment as used in a fitness studio, clean materials, no background, no person`;
}
