export type TaxonomyTabId =
  | "anatomy"
  | "catalog_movement_types"
  | "catalog_equipment"
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
  { id: "catalog_variations", label: "Variations" },
  { id: "catalog_positions", label: "Positions" },
  { id: "catalog_grips", label: "Grips" },
  { id: "catalog_load_modalities", label: "Load" },
  { id: "catalog_logging_modes", label: "Logging" },
  { id: "catalog_muscles", label: "Muscles" },
  { id: "catalog_muscle_groups", label: "Groups" },
];

export type LookupRowFull = {
  id: string;
  code: string;
  name: string;
  sort_order?: number;
  active?: boolean;
};

export type MuscleGroupRow = {
  id: string;
  code: string;
  name: string;
  active?: boolean;
  group_muscles: Array<{
    role: string;
    muscle: { id: string; code: string; name: string; active?: boolean };
  }>;
  group_movement_types: Array<{
    movement_type: { id: string; code: string; name: string; active?: boolean };
  }>;
};

export type TaxonomyData = {
  catalog_muscle_groups: MuscleGroupRow[];
  catalog_muscles: LookupRowFull[];
  catalog_movement_types: LookupRowFull[];
  catalog_equipment: LookupRowFull[];
  catalog_variations: LookupRowFull[];
  catalog_positions: LookupRowFull[];
  catalog_grips: LookupRowFull[];
  catalog_load_modalities: LookupRowFull[];
  catalog_logging_modes: LookupRowFull[];
};
