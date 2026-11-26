import type { LocalizationRow } from "@/lib/catalog/locales";

export type TaxonomyTabId =
  | "anatomy"
  | "group_movements"
  | "catalog_movement_types"
  | "catalog_strength_patterns"
  | "catalog_equipment"
  | "catalog_support_equipment"
  | "catalog_variations"
  | "catalog_positions"
  | "catalog_grips"
  | "catalog_load_modalities"
  | "catalog_logging_modes"
  | "catalog_muscles"
  | "catalog_muscle_groups"
  | "catalog_body_regions";

export const TAXONOMY_TABS: Array<{ id: TaxonomyTabId; label: string }> = [
  { id: "anatomy", label: "Anatomy" },
  { id: "group_movements", label: "Group movements" },
  { id: "catalog_movement_types", label: "Movements" },
  { id: "catalog_strength_patterns", label: "Patterns" },
  { id: "catalog_equipment", label: "Equipment" },
  { id: "catalog_support_equipment", label: "Support" },
  { id: "catalog_variations", label: "Variations" },
  { id: "catalog_positions", label: "Positions" },
  { id: "catalog_grips", label: "Grips" },
  { id: "catalog_load_modalities", label: "Load" },
  { id: "catalog_logging_modes", label: "Logging" },
  { id: "catalog_muscles", label: "Muscles" },
  { id: "catalog_muscle_groups", label: "Groups" },
  { id: "catalog_body_regions", label: "Regions" },
];

export const LOCALIZED_TAXONOMY_TABLES = new Set<TaxonomyTabId>([
  "catalog_equipment",
  "catalog_support_equipment",
  "catalog_movement_types",
  "catalog_muscles",
  "catalog_muscle_groups",
  "catalog_body_regions",
  "catalog_load_modalities",
  "catalog_grips",
  "catalog_strength_patterns",
]);

/**
 * Tables with an optional staff-only description: a visual one for image prompts, or the
 * operational definition of a movement type or strength pattern (`DESCRIPTION_HINTS`).
 */
export const DESCRIBED_TAXONOMY_TABLES = new Set<TaxonomyTabId>([
  "catalog_movement_types",
  "catalog_strength_patterns",
  "catalog_equipment",
  "catalog_grips",
  "catalog_support_equipment",
  "catalog_muscles",
  "catalog_muscle_groups",
  "catalog_body_regions",
]);

export type LookupRowFull = {
  id: string;
  code: string;
  name: string;
  /** Internal visual description (equipment / grips / support / muscles / groups / regions); not localized. */
  description?: string | null;
  sort_order?: number;
  active?: boolean;
  localizations?: LocalizationRow[];
  /** Muscle groups: the body region they belong to. */
  body_region_id?: string;
  /** Movement types: the strength pattern (null = isolation). */
  strength_pattern?: { code: string; name: string } | null;
  /** Muscle groups: `major`, `accessory` or `cardio` (backend 2.10.0), set by migration only. */
  kind?: string | null;
  /** Muscles: false = a sentinel, not a muscle (CARDIOVASCULAR); kept out of the muscle pickers. */
  is_anatomical?: boolean;
  /** Muscles: the home group (its `target` membership). */
  home_muscle_group?: { code: string } | null;
};

/** Strength patterns: a closed list (name, description, sort order and labels are editable). */
export type StrengthPatternRow = LookupRowFull;

export type MuscleGroupRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  active?: boolean;
  body_region_id: string;
  /** `major`, `accessory` or `cardio` (backend 2.10.0); a cardio group is logged as TIME. */
  kind?: string | null;
  localizations?: LocalizationRow[];
  group_muscles: Array<{
    role: string;
    muscle: {
      id: string;
      code: string;
      name: string;
      description?: string | null;
      active?: boolean;
      is_anatomical?: boolean;
      localizations?: LocalizationRow[];
    };
  }>;
  group_movement_types: Array<{
    movement_type: {
      id: string;
      code: string;
      name: string;
      active?: boolean;
      localizations?: LocalizationRow[];
    };
    /** Custom name of this group + movement pair ("Chest Press"), per locale. */
    localizations?: LocalizationRow[];
    /** Default muscles of the pair; inheriting exercises use them. */
    target_muscle?: { code: string; name: string } | null;
    secondary_muscles?: Array<{ muscle: { code: string; name: string } }>;
    /** false = the pair takes its movement type's pattern; true = `strength_pattern` (null = isolation). */
    strength_pattern_override?: boolean;
    strength_pattern?: { code: string; name: string } | null;
    /**
     * Target profiles of the pair (backend 2.10.0): another target with its own secondaries and
     * the reason, inherited by the pair's exercises that keep that target.
     */
    target_profiles?: Array<{
      reason?: string | null;
      target_muscle: { code: string; name: string };
      secondary_muscles?: Array<{ muscle: { code: string; name: string } }>;
    }>;
    exercises?: Array<{ muscles_inherited: boolean; target_muscle?: { code: string } | null }>;
  }>;
};

export type TaxonomyData = {
  catalog_body_regions: LookupRowFull[];
  catalog_muscle_groups: MuscleGroupRow[];
  catalog_muscles: LookupRowFull[];
  catalog_movement_types: LookupRowFull[];
  catalog_strength_patterns: StrengthPatternRow[];
  catalog_equipment: LookupRowFull[];
  catalog_support_equipment: LookupRowFull[];
  catalog_variations: LookupRowFull[];
  catalog_positions: LookupRowFull[];
  catalog_grips: LookupRowFull[];
  catalog_load_modalities: LookupRowFull[];
  catalog_logging_modes: LookupRowFull[];
};
