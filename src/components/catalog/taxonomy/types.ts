import type { LocalizationRow } from "@/lib/catalog/locales";

export type TaxonomyTabId =
  | "anatomy"
  | "catalog_movement_types"
  | "catalog_equipment"
  | "catalog_support_equipment"
  | "catalog_variations"
  | "catalog_positions"
  | "catalog_grips"
  | "catalog_load_modalities"
  | "catalog_logging_modes"
  | "catalog_muscles"
  | "catalog_muscle_groups";

export const TAXONOMY_TABS: Array<{ id: TaxonomyTabId; label: string }> = [
  { id: "anatomy", label: "Anatomy" },
  { id: "catalog_movement_types", label: "Movements" },
  { id: "catalog_equipment", label: "Equipment" },
  { id: "catalog_support_equipment", label: "Support" },
  { id: "catalog_variations", label: "Variations" },
  { id: "catalog_positions", label: "Positions" },
  { id: "catalog_grips", label: "Grips" },
  { id: "catalog_load_modalities", label: "Load" },
  { id: "catalog_logging_modes", label: "Logging" },
  { id: "catalog_muscles", label: "Muscles" },
  { id: "catalog_muscle_groups", label: "Groups" },
];

export const LOCALIZED_TAXONOMY_TABLES = new Set<TaxonomyTabId>([
  "catalog_equipment",
  "catalog_support_equipment",
  "catalog_movement_types",
  "catalog_muscles",
  "catalog_muscle_groups",
]);

export type LookupRowFull = {
  id: string;
  code: string;
  name: string;
  sort_order?: number;
  active?: boolean;
  localizations?: LocalizationRow[];
};

export type MuscleGroupRow = {
  id: string;
  code: string;
  name: string;
  active?: boolean;
  localizations?: LocalizationRow[];
  group_muscles: Array<{
    role: string;
    muscle: {
      id: string;
      code: string;
      name: string;
      active?: boolean;
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
  }>;
};

export type TaxonomyData = {
  catalog_muscle_groups: MuscleGroupRow[];
  catalog_muscles: LookupRowFull[];
  catalog_movement_types: LookupRowFull[];
  catalog_equipment: LookupRowFull[];
  catalog_support_equipment: LookupRowFull[];
  catalog_variations: LookupRowFull[];
  catalog_positions: LookupRowFull[];
  catalog_grips: LookupRowFull[];
  catalog_load_modalities: LookupRowFull[];
  catalog_logging_modes: LookupRowFull[];
};
