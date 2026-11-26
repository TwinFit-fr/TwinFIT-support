/**
 * Facets of an exercise that backend 2.10.0 stores as text with a CHECK list (not lookup tables):
 * `width`, `inclination` and `laterality` (DATABASE_CONTRACT, "Facets of an exercise"), plus the
 * `app_visible` listing flag. New values come only with a backend migration.
 */

export const WIDTHS = ["NARROW", "STANDARD", "WIDE"] as const;
export const INCLINATIONS = ["FLAT", "INCLINE", "DECLINE"] as const;
export const LATERALITIES = ["BILATERAL", "UNILATERAL", "ALTERNATING"] as const;

export type Width = (typeof WIDTHS)[number];
export type Inclination = (typeof INCLINATIONS)[number];
export type Laterality = (typeof LATERALITIES)[number];

/** The database defaults of a new row. */
export const FACET_DEFAULTS = {
  width: "STANDARD",
  inclination: "FLAT",
  laterality: "BILATERAL",
  app_visible: true,
} as const satisfies {
  width: Width;
  inclination: Inclination;
  laterality: Laterality;
  app_visible: boolean;
};

/** One line per value, for the editor's selectors (what the contract says each one means). */
export const FACET_HINTS: Record<Width | Inclination | Laterality, string> = {
  NARROW: "hands or feet closer than the shoulders",
  STANDARD: "about shoulder width",
  WIDE: "hands or feet wider than the shoulders (sumo, wide grip)",
  FLAT: "no slope",
  INCLINE: "torso higher than the hips (bench back raised, cable low to high)",
  DECLINE: "hips higher than the torso (decline bench, cable high to low)",
  BILATERAL: "both sides together",
  UNILATERAL: "one side at a time, all reps, then the other",
  ALTERNATING: "sides alternate within the set",
};

/**
 * Grip of a new exercise: `NONE` (no grip applies) until staff pick the orientation of the hand.
 * `STANDARD` is the legacy value of a row not classified yet (the database default); Support
 * never proposes it.
 */
export const DEFAULT_GRIP_CODE = "NONE";
export const UNCLASSIFIED_GRIP_CODE = "STANDARD";

export type ExerciseFacetFields = {
  width?: Width;
  inclination?: Inclination;
  laterality?: Laterality;
  app_visible?: boolean;
};

const FACET_KEYS = ["width", "inclination", "laterality", "app_visible"] as const;

/** The facet columns of a new exercise: the payload's values, the database defaults otherwise. */
export function facetColumnsForCreate(payload: ExerciseFacetFields): Required<ExerciseFacetFields> {
  return {
    width: payload.width ?? FACET_DEFAULTS.width,
    inclination: payload.inclination ?? FACET_DEFAULTS.inclination,
    laterality: payload.laterality ?? FACET_DEFAULTS.laterality,
    app_visible: payload.app_visible ?? FACET_DEFAULTS.app_visible,
  };
}

/** Only the facet columns present in the payload, so an update keeps the others. */
export function providedFacetColumns(payload: ExerciseFacetFields): ExerciseFacetFields {
  const out: Record<string, unknown> = {};
  for (const key of FACET_KEYS) {
    if (payload[key] !== undefined && payload[key] !== null) out[key] = payload[key];
  }
  return out as ExerciseFacetFields;
}

/** A lookup value as the editor lists it. */
export type SelectableRow = { code: string; name?: string; active?: boolean; sort_order?: number };

/**
 * The values a selector offers: the active ones in catalog order, plus the current value when it
 * is retired (so an old exercise still shows what it has; flagged `retired`).
 */
export function selectableOptions<T extends SelectableRow>(
  rows: readonly T[],
  current: string,
): (T & { retired: boolean })[] {
  const ordered = [...rows].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.code.localeCompare(b.code),
  );
  return ordered
    .filter((row) => row.active !== false || row.code === current)
    .map((row) => ({ ...row, retired: row.active === false }));
}

/** The fields of the facet tuple, as the form holds them. */
export type FacetTupleForm = {
  primary_muscle_group_code: string;
  movement_type_code: string;
  equipment_code: string;
  support_equipment_code: string;
  grip_code: string;
  position_code: string;
  variation_code: string;
  width: string;
  inclination: string;
  laterality: string;
};

/** The facet tuple of a catalog row. */
export type FacetTupleExercise = {
  exo_id: number;
  display_name: string;
  primary_muscle_group?: { code: string } | null;
  movement_type?: { code: string } | null;
  equipment?: { code: string } | null;
  support_equipment?: { code: string } | null;
  grip?: { code: string } | null;
  position?: { code: string } | null;
  variation?: { code: string } | null;
  width?: string | null;
  inclination?: string | null;
  laterality?: string | null;
};

const norm = (value: string | null | undefined) => String(value ?? "").trim().toUpperCase();

function tupleKey(parts: (string | null | undefined)[]): string {
  return parts.map(norm).join("|");
}

/**
 * Group, movement, equipment, support, grip, posture, variation, width, inclination and
 * laterality: together they are unique among active exercises (backend `catalogSeed.test.ts`,
 * with a whitelist of known exceptions; no database index).
 */
export function facetTupleOfForm(form: FacetTupleForm): string {
  return tupleKey([
    form.primary_muscle_group_code,
    form.movement_type_code,
    form.equipment_code,
    form.support_equipment_code,
    form.grip_code,
    form.position_code,
    form.variation_code,
    form.width || FACET_DEFAULTS.width,
    form.inclination || FACET_DEFAULTS.inclination,
    form.laterality || FACET_DEFAULTS.laterality,
  ]);
}

export function facetTupleOfExercise(ex: FacetTupleExercise): string {
  return tupleKey([
    ex.primary_muscle_group?.code,
    ex.movement_type?.code,
    ex.equipment?.code,
    ex.support_equipment?.code,
    ex.grip?.code,
    ex.position?.code,
    ex.variation?.code,
    ex.width || FACET_DEFAULTS.width,
    ex.inclination || FACET_DEFAULTS.inclination,
    ex.laterality || FACET_DEFAULTS.laterality,
  ]);
}

/** Another active exercise with the same facet tuple as the form (not `exoId` itself), if any. */
export function findFacetTupleDuplicate<T extends FacetTupleExercise>(
  form: FacetTupleForm,
  exercises: readonly T[],
  exoId?: number | null,
): T | null {
  const key = facetTupleOfForm(form);
  return exercises.find((ex) => ex.exo_id !== exoId && facetTupleOfExercise(ex) === key) ?? null;
}

const GRIP_WORDS = /\b(grip|grips|grasp\w*|palms?|hands?|thumbs?|knuckles?|overhand|underhand|pronat\w*|supinat\w*|neutral)\b/i;

/**
 * The sentences of a pose text that say how the hands hold the load: the evidence staff read to
 * settle a grip left `STANDARD` (backend migration 1790000000104 left the rows whose pose was
 * silent or disagreed with the how-to). Empty when the pose says nothing about the hands.
 */
export function gripEvidence(pose: string): string[] {
  return pose
    .split(/(?<=[.;])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && GRIP_WORDS.test(sentence));
}
