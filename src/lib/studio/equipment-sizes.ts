import type { EquipmentKind } from "./types";

/*
 * Server-side defaults written into a new equipment_models row (params.size_m, the texture
 * prompt). The viewer never reads this table: it uses the row's params, which staff edit, so the
 * size of a model is data, not code, once the row exists.
 */

/**
 * Longest dimension, in metres, each catalog implement is scaled to in the viewer. Generated
 * meshes come in arbitrary units; the viewer measures the model's bounding box and scales it
 * to this size (params.size_m of the row overrides it).
 */
const EQUIPMENT_SIZE_M: Record<EquipmentKind, Record<string, number>> = {
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

/** Texture hint sent with every generation: the catalog look, without a background or a person. */
export function defaultTexturePrompt(kind: EquipmentKind, name: string): string {
  return kind === "load"
    ? `${name}: realistic gym equipment, clean studio materials, no background, no hands, no person`
    : `${name}: realistic gym equipment as used in a fitness studio, clean materials, no background, no person`;
}
