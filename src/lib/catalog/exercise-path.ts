export type CatalogLevel = {
  key: string;
  label: string;
  table: string;
  field: string;
};

export const CATALOG_LEVELS: CatalogLevel[] = [
  {
    key: "muscle_group",
    label: "Muscle group",
    table: "catalog_muscle_groups",
    field: "primary_muscle_group_code",
  },
  {
    key: "movement_type",
    label: "Movement",
    table: "catalog_movement_types",
    field: "movement_type_code",
  },
  {
    key: "equipment",
    label: "Equipment",
    table: "catalog_equipment",
    field: "equipment_code",
  },
  {
    key: "position",
    label: "Position",
    table: "catalog_positions",
    field: "position_code",
  },
  {
    key: "grip",
    label: "Grip",
    table: "catalog_grips",
    field: "grip_code",
  },
  {
    key: "variation",
    label: "Variation",
    table: "catalog_variations",
    field: "variation_code",
  },
  {
    key: "load_modality",
    label: "Load modality",
    table: "catalog_load_modalities",
    field: "load_modality_code",
  },
];

export type ExerciseWithPath = {
  exo_id: number;
  display_name: string;
  taxonomy_status: string;
  path: string[];
  primary_muscle_group?: { code: string };
  movement_type?: { code: string };
  equipment?: { code: string };
  position?: { code: string };
  grip?: { code: string };
  variation?: { code: string };
  load_modality?: { code: string };
};

export type LookupRow = { code: string; name?: string };

export function normTaxonomy(v: string | undefined | null): string {
  return String(v || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function pathKey(parts: string[]): string {
  return parts.map((p) => normTaxonomy(p)).join("|");
}

export function buildExercisePath(ex: {
  primary_muscle_group?: { code: string };
  movement_type?: { code: string };
  equipment?: { code: string };
  position?: { code: string };
  grip?: { code: string };
  variation?: { code: string };
  load_modality?: { code: string };
}): string[] {
  return [
    ex.primary_muscle_group?.code ?? "",
    ex.movement_type?.code ?? "",
    ex.equipment?.code ?? "",
    ex.position?.code ?? "",
    ex.grip?.code ?? "",
    ex.variation?.code ?? "",
    ex.load_modality?.code ?? "",
  ].map((c) => normTaxonomy(c) || "—");
}

export function withExercisePaths<T extends object>(
  exercises: T[],
): (T & { path: string[] })[] {
  return exercises.map((ex) => ({
    ...ex,
    path: buildExercisePath(ex as ExerciseWithPath),
  }));
}

export function filterByPrefix(
  exercises: ExerciseWithPath[],
  prefixParts: string[],
): ExerciseWithPath[] {
  return exercises.filter((ex) => {
    for (let i = 0; i < prefixParts.length; i++) {
      if (normTaxonomy(ex.path[i]) !== normTaxonomy(prefixParts[i])) return false;
    }
    return true;
  });
}

export function valuesUnder(
  exercises: ExerciseWithPath[],
  prefixParts: string[],
  extras: Record<string, string[]>,
  muscleGroups?: LookupRow[],
): { value: string; count: number }[] {
  const depth = prefixParts.length;
  if (depth >= CATALOG_LEVELS.length) return [];

  const counts = new Map<string, number>();
  for (const ex of filterByPrefix(exercises, prefixParts)) {
    const v = ex.path[depth] || "—";
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  const pk = pathKey(prefixParts);
  for (const v of extras[pk] || []) {
    if (!counts.has(v)) counts.set(v, 0);
  }

  if (depth === 0 && muscleGroups) {
    for (const g of muscleGroups) {
      if (!counts.has(g.code)) counts.set(g.code, 0);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([value, count]) => ({ value, count }));
}

export function leavesUnder(
  exercises: ExerciseWithPath[],
  prefix: string[],
): ExerciseWithPath[] {
  return filterByPrefix(exercises, prefix).sort((a, b) => a.exo_id - b.exo_id);
}

export function composeUrlFromPath(prefix: string[]): string {
  const encoded = prefix.map((p) => normTaxonomy(p)).join("|");
  return `/catalog/compose?from_path=${encodeURIComponent(encoded)}`;
}

export function parseFromPath(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split("|").map((p) => normTaxonomy(p)).filter(Boolean);
}

export function rememberExtra(
  extras: Record<string, string[]>,
  prefix: string[],
  value: string,
): Record<string, string[]> {
  const k = pathKey(prefix);
  const v = normTaxonomy(value);
  if (!v) return extras;
  const list = extras[k] || [];
  if (list.includes(v)) return extras;
  return { ...extras, [k]: [...list, v] };
}

export function getLevelByKey(key: string): CatalogLevel | undefined {
  return CATALOG_LEVELS.find((l) => l.key === key);
}

export function defaultVisibleLevelKeys(): string[] {
  return CATALOG_LEVELS.map((l) => l.key);
}

/** Prefix values for visible levels before targetLevelKey (for extras / add-node). */
export function selectionPrefixParts(
  visibleLevelKeys: string[],
  selection: Record<string, string>,
  targetLevelKey: string,
): string[] {
  const targetIdx = visibleLevelKeys.indexOf(targetLevelKey);
  if (targetIdx <= 0) return [];
  return visibleLevelKeys
    .slice(0, targetIdx)
    .map((k) => selection[k])
    .filter((v) => v && v !== "—");
}

export function filterBySelection(
  exercises: ExerciseWithPath[],
  visibleLevelKeys: string[],
  selection: Record<string, string>,
): ExerciseWithPath[] {
  return exercises.filter((ex) => {
    for (const key of visibleLevelKeys) {
      const sel = selection[key];
      if (!sel) continue;
      const idx = CATALOG_LEVELS.findIndex((l) => l.key === key);
      if (normTaxonomy(ex.path[idx]) !== normTaxonomy(sel)) return false;
    }
    return true;
  });
}

export function valuesForColumn(
  exercises: ExerciseWithPath[],
  visibleLevelKeys: string[],
  selection: Record<string, string>,
  targetLevelKey: string,
  extras: Record<string, string[]>,
  lookupRows?: LookupRow[],
  muscleGroups?: LookupRow[],
): { value: string; count: number; name?: string }[] {
  const targetIdx = visibleLevelKeys.indexOf(targetLevelKey);
  if (targetIdx < 0) return [];

  const levelIndex = CATALOG_LEVELS.findIndex((l) => l.key === targetLevelKey);
  const subset = exercises.filter((ex) => {
    for (let i = 0; i < targetIdx; i++) {
      const k = visibleLevelKeys[i];
      const sel = selection[k];
      if (!sel) return false;
      const idx = CATALOG_LEVELS.findIndex((l) => l.key === k);
      if (normTaxonomy(ex.path[idx]) !== normTaxonomy(sel)) return false;
    }
    return true;
  });

  const counts = new Map<string, number>();
  for (const ex of subset) {
    const v = ex.path[levelIndex] || "—";
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  const prefixParts = selectionPrefixParts(visibleLevelKeys, selection, targetLevelKey);
  const pk = pathKey(prefixParts);
  for (const v of extras[pk] || []) {
    if (!counts.has(v)) counts.set(v, 0);
  }

  if (levelIndex === 0 && muscleGroups) {
    for (const g of muscleGroups) {
      if (!counts.has(g.code)) counts.set(g.code, 0);
    }
  }

  const nameByCode = new Map<string, string>();
  for (const row of lookupRows ?? []) {
    nameByCode.set(row.code, row.name ?? row.code);
  }
  if (levelIndex === 0 && muscleGroups) {
    for (const g of muscleGroups) {
      nameByCode.set(g.code, g.name ?? g.code);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([value, count]) => ({
      value,
      count,
      name: nameByCode.get(value),
    }));
}

export function selectionFromVisiblePath(
  visibleLevelKeys: string[],
  pathParts: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < pathParts.length && i < visibleLevelKeys.length; i++) {
    out[visibleLevelKeys[i]] = pathParts[i];
  }
  return out;
}

export function filterByVisiblePath(
  exercises: ExerciseWithPath[],
  visibleLevelKeys: string[],
  pathParts: string[],
): ExerciseWithPath[] {
  return exercises.filter((ex) => {
    for (let i = 0; i < pathParts.length; i++) {
      const key = visibleLevelKeys[i];
      const levelIdx = CATALOG_LEVELS.findIndex((l) => l.key === key);
      if (levelIdx < 0) return false;
      if (normTaxonomy(ex.path[levelIdx]) !== normTaxonomy(pathParts[i])) return false;
    }
    return true;
  });
}

export function isVisiblePathComplete(
  visibleLevelKeys: string[],
  pathParts: string[],
): boolean {
  return pathParts.length >= visibleLevelKeys.length;
}


/** Full 7-axis path for compose URL (defaults for unset / hidden levels). */
export function fullPathFromSelection(selection: Record<string, string>): string[] {
  return CATALOG_LEVELS.map((level) => {
    const sel = selection[level.key];
    if (sel) return normTaxonomy(sel);
    if (level.key === "position") return "NEUTRAL";
    if (level.key === "grip" || level.key === "variation") return "STANDARD";
    return "";
  }).filter(Boolean);
}

export function composeUrlFromSelection(selection: Record<string, string>): string {
  const parts = fullPathFromSelection(selection);
  return composeUrlFromPath(parts);
}

export function buildPathFromForm(form: {
  primary_muscle_group_code: string;
  movement_type_code: string;
  equipment_code: string;
  position_code: string;
  grip_code: string;
  variation_code: string;
  load_modality_code: string;
}): string[] {
  return [
    form.primary_muscle_group_code,
    form.movement_type_code,
    form.equipment_code,
    form.position_code,
    form.grip_code,
    form.variation_code,
    form.load_modality_code,
  ].map((c) => normTaxonomy(c) || "—");
}

export function pathsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => normTaxonomy(v) === normTaxonomy(b[i]));
}

export function exerciseTaxonomyPath(ex: ExerciseWithPath): string[] {
  return ex.path?.length ? ex.path : buildExercisePath(ex);
}

export function formCreateFingerprint(form: {
  display_name: string;
  description: string;
  primary_muscle_group_code: string;
  movement_type_code: string;
  equipment_code: string;
  position_code: string;
  grip_code: string;
  variation_code: string;
  load_modality_code: string;
  target_muscle_code: string;
  taxonomy_status: string;
}): string {
  return JSON.stringify({
    display_name: String(form.display_name || "").trim().toLowerCase(),
    description: String(form.description || "").trim(),
    primary_muscle_group_code: normTaxonomy(form.primary_muscle_group_code),
    movement_type_code: normTaxonomy(form.movement_type_code),
    equipment_code: normTaxonomy(form.equipment_code),
    position_code: normTaxonomy(form.position_code),
    grip_code: normTaxonomy(form.grip_code),
    variation_code: normTaxonomy(form.variation_code),
    load_modality_code: normTaxonomy(form.load_modality_code),
    target_muscle_code: String(form.target_muscle_code || "").trim().toLowerCase(),
    taxonomy_status: form.taxonomy_status || "migrated",
    secondary_muscle_codes: [] as string[],
  });
}

export function exerciseFingerprintFromCatalog(ex: {
  display_name: string;
  taxonomy_status: string;
  primary_muscle_group?: { code: string };
  movement_type?: { code: string };
  equipment?: { code: string };
  position?: { code: string };
  grip?: { code: string };
  variation?: { code: string };
  load_modality?: { code: string };
  target_muscle?: { code: string };
  localizations?: Array<{ description?: string | null }>;
}): string {
  return JSON.stringify({
    display_name: String(ex.display_name || "").trim().toLowerCase(),
    description: String(ex.localizations?.[0]?.description || "").trim(),
    primary_muscle_group_code: normTaxonomy(ex.primary_muscle_group?.code),
    movement_type_code: normTaxonomy(ex.movement_type?.code),
    equipment_code: normTaxonomy(ex.equipment?.code),
    position_code: normTaxonomy(ex.position?.code),
    grip_code: normTaxonomy(ex.grip?.code),
    variation_code: normTaxonomy(ex.variation?.code),
    load_modality_code: normTaxonomy(ex.load_modality?.code),
    target_muscle_code: String(ex.target_muscle?.code || "").trim().toLowerCase(),
    taxonomy_status: ex.taxonomy_status || "migrated",
    secondary_muscle_codes: [] as string[],
  });
}
