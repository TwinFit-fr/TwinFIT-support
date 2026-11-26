import { parseBodyMassCoefficient, parsePulleyRatio } from "./guard-rails.ts";
import type { ExerciseFacetFields } from "./facets.ts";
import { CATALOG_LOCALES, type CatalogLocale } from "./locales.ts";

type Code = string | null | undefined;

/**
 * Body of the compose / update requests; legacy aliases (`muscle_group`, …) still accepted. The
 * facets of backend 2.10.0 (`width`, `inclination`, `laterality`, `app_visible`) come from
 * `ExerciseFacetFields`.
 */
export type ExercisePayload = ExerciseFacetFields & {
  exo_id?: number | string;
  display_name?: string;
  description?: string | null;
  primary_muscle_group_code?: Code;
  muscle_group?: Code;
  movement_type_code?: Code;
  movement_type?: Code;
  equipment_code?: Code;
  equipment?: Code;
  support_equipment_code?: Code;
  support_equipment?: Code;
  variation_code?: Code;
  variation?: Code;
  position_code?: Code;
  position?: Code;
  grip_code?: Code;
  grip?: Code;
  load_modality_code?: Code;
  load_modality?: Code;
  logging_mode_code?: Code;
  logging_mode?: Code;
  target_muscle_code?: Code;
  secondary_muscle_codes?: string[];
  /** True: the exercise uses its pair's muscles; false: its own (custom). */
  muscles_inherited?: boolean;
  /** Why a custom exercise does not use its pair's muscles; required when `muscles_inherited` is false. */
  muscles_custom_reason?: string | null;
  taxonomy_status?: string;
  taxonomy_notes?: string | null;
  body_mass_coefficient?: number | string | null;
  default_pulley_ratio?: number | string | null;
  localizations?: Partial<
    Record<CatalogLocale, { display_name?: string | null; description?: string | null }>
  >;
};

export type TaxonomyStatus = "migrated" | "pending";

/**
 * A code as typed, for looking a row up: trimmed, single spaces, upper case. Spaces stay because
 * the legacy movement codes `CALF RAISE`, `LEG RAISE` and `HIP THRUST` keep them; a new code is
 * SCREAMING_SNAKE without spaces (`newTaxonomyCode`).
 */
export function normalizeTaxonomy(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/** Muscle codes are SCREAMING_SNAKE (`ANTERIOR_DELTS`). */
export function normalizeMuscleCode(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Title Case admin/fallback label from a code (`SMITH_MACHINE` → `Smith Machine`). */
export function defaultLookupName(code: string): string {
  return code
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

const muscleGroupCode = (p: ExercisePayload) => p.primary_muscle_group_code || p.muscle_group;
const movementTypeCode = (p: ExercisePayload) => p.movement_type_code || p.movement_type;
const equipmentCode = (p: ExercisePayload) => p.equipment_code || p.equipment;

/** A mandatory code (position, load modality): empty is an error, never a silent default. */
export function requireCode(label: string, ...candidates: unknown[]): string {
  const code = candidates.map((c) => String(c ?? "").trim()).find(Boolean);
  if (!code) throw new Error(`${label} is required`);
  return code;
}

/** UI + volume: TIME for HOLD / CARDIO group / CARDIO movement; else LOAD. */
export function inferLoggingModeCode(payload: ExercisePayload): string {
  const mt = normalizeTaxonomy(movementTypeCode(payload));
  const mg = normalizeTaxonomy(muscleGroupCode(payload));
  if (mt === "HOLD" || mg === "CARDIO" || mt === "CARDIO") return "TIME";
  return "LOAD";
}

export function normalizeTaxonomyStatus(raw: unknown): TaxonomyStatus {
  const s = String(raw || "migrated").trim();
  if (s === "pending_review" || s === "pending") return "pending";
  if (s === "migrated") return "migrated";
  throw new Error(`Invalid taxonomy_status "${raw}" (use migrated|pending)`);
}

/** Fields required for taxonomy_status = migrated. */
function requiredGaps(payload: ExercisePayload): string[] {
  const fields: [string, unknown][] = [
    ["display_name", payload.display_name],
    ["primary_muscle_group", muscleGroupCode(payload)],
    ["movement_type", movementTypeCode(payload)],
    ["equipment", equipmentCode(payload)],
    ["position", payload.position_code || payload.position],
    ["grip", payload.grip_code || payload.grip],
    ["variation", payload.variation_code || payload.variation],
    ["target_muscle", payload.target_muscle_code],
  ];
  return fields.filter(([, value]) => !String(value || "").trim()).map(([label]) => label);
}

/** Incomplete exercises can never be migrated; the requested status drops to pending. */
export function resolveTaxonomyStatus(
  payload: ExercisePayload,
  requestedRaw: unknown,
): { status: TaxonomyStatus; requested: TaxonomyStatus; gaps: string[] } {
  const gaps = requiredGaps(payload);
  const requested = normalizeTaxonomyStatus(requestedRaw || "migrated");
  const status = gaps.length && requested === "migrated" ? "pending" : requested;
  return { status, requested, gaps };
}

export type BiomechanicalFields = {
  body_mass_coefficient: number | null;
  default_pulley_ratio: number;
};

/**
 * Validated biomechanics with the catalog defaults for blank values: C_ex empty or in (0, 1]
 * (backend 2.10.0, was [0, 1.5]), pulley ratio > 0. No wrist IMU mode: backend
 * 2.10.0 dropped `catalog.exercises.wrist_imu_mode` (migration 1790000000116) and refuses a write
 * that names it; a `wrist_imu_mode` key a caller still sends is ignored.
 */
export function parseBiomechanicalFields(payload: ExercisePayload): BiomechanicalFields {
  return {
    body_mass_coefficient: parseBodyMassCoefficient(payload.body_mass_coefficient),
    default_pulley_ratio: parsePulleyRatio(payload.default_pulley_ratio),
  };
}

/** Only the biomechanical fields present in the payload, so an update keeps the others. */
export function providedBiomechanicalFields(payload: ExercisePayload): Partial<BiomechanicalFields> {
  const parsed = parseBiomechanicalFields(payload);
  const keys = ["body_mass_coefficient", "default_pulley_ratio"] as const;
  return Object.fromEntries(keys.filter((k) => k in payload).map((k) => [k, parsed[k]]));
}

export type ExerciseLocalizationRow = {
  locale: CatalogLocale;
  display_name: string;
  description: string | null;
};

/** EN is required (falls back to `display_name`); ES/FR only when they have a name. */
export function buildExerciseLocalizationRows(
  payload: ExercisePayload,
  displayName: string,
  description: string | null,
): ExerciseLocalizationRow[] {
  const locs = payload.localizations ?? {};
  const rows: ExerciseLocalizationRow[] = [];
  for (const locale of CATALOG_LOCALES) {
    const entry = locs[locale];
    const name = String(entry?.display_name || (locale === "en" ? displayName : "") || "").trim();
    if (!name) {
      if (locale === "en") throw new Error("English display name is required");
      continue;
    }
    const fallback = locale === "en" ? description : null;
    const desc = entry?.description != null ? String(entry.description).trim() || null : fallback;
    rows.push({ locale, display_name: name, description: desc });
  }
  return rows;
}
