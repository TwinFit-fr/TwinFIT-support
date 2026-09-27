import {
  CATALOG_LEVELS,
  getLevelByKey,
  normTaxonomy,
  type ExerciseWithPath,
} from "./exercise-path";
import {
  resolveExerciseDisplayName,
  type CatalogLocale,
} from "./locales";

export type AxisFilters = Record<string, string>;

export function exerciseAxisValue(
  ex: ExerciseWithPath & { support_equipment?: { code: string } | null },
  levelKey: string,
): string {
  switch (levelKey) {
    case "muscle_group":
      return ex.primary_muscle_group?.code ?? "";
    case "movement_type":
      return ex.movement_type?.code ?? "";
    case "equipment":
      return ex.equipment?.code ?? "";
    case "position":
      return ex.position?.code ?? "";
    case "grip":
      return ex.grip?.code ?? "";
    case "variation":
      return ex.variation?.code ?? "";
    case "load_modality":
      return ex.load_modality?.code ?? "";
    default:
      return "";
  }
}

export function filterExercisesForBrowser(
  exercises: Array<
    ExerciseWithPath & {
      support_equipment?: { code: string } | null;
      localizations?: Array<{ locale: string; display_name?: string | null }>;
    }
  >,
  search: string,
  filters: AxisFilters,
  locale: CatalogLocale,
): typeof exercises {
  const q = search.trim().toLowerCase();
  return exercises.filter((ex) => {
    if (q) {
      const name = resolveExerciseDisplayName(ex, locale).toLowerCase();
      const en = resolveExerciseDisplayName(ex, "en").toLowerCase();
      const match =
        name.includes(q) ||
        en.includes(q) ||
        String(ex.exo_id).includes(q) ||
        ex.primary_muscle_group?.code.toLowerCase().includes(q);
      if (!match) return false;
    }
    for (const level of CATALOG_LEVELS) {
      const sel = filters[level.key];
      if (!sel) continue;
      if (normTaxonomy(exerciseAxisValue(ex, level.key)) !== normTaxonomy(sel)) {
        return false;
      }
    }
    return true;
  });
}

export type ExerciseGroup = {
  key: string;
  code: string;
  exercises: ExerciseWithPath[];
};

export function groupExercises(
  exercises: ExerciseWithPath[],
  groupByKey: string,
): ExerciseGroup[] {
  const level = getLevelByKey(groupByKey);
  if (!level) return [];

  const buckets = new Map<string, ExerciseWithPath[]>();
  for (const ex of exercises) {
    const code = normTaxonomy(exerciseAxisValue(ex, groupByKey)) || "—";
    const list = buckets.get(code) ?? [];
    list.push(ex);
    buckets.set(code, list);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, groupExercises]) => ({
      key: code,
      code,
      exercises: groupExercises.sort((a, b) => a.exo_id - b.exo_id),
    }));
}

export function filtersToCreateSelection(
  filters: AxisFilters,
  groupByKey: string,
  groupCode: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const level of CATALOG_LEVELS) {
    if (level.key === groupByKey) {
      if (groupCode && groupCode !== "—") out[level.key] = groupCode;
      continue;
    }
    const v = filters[level.key];
    if (v) out[level.key] = v;
  }
  return out;
}

export function badgeAxesForExercise(
  ex: ExerciseWithPath & { support_equipment?: { code: string } | null },
  groupByKey: string,
): Array<{ key: string; code: string }> {
  const badges: Array<{ key: string; code: string }> = [];
  for (const level of CATALOG_LEVELS) {
    if (level.key === groupByKey) continue;
    const code = exerciseAxisValue(ex, level.key);
    if (code && code !== "—") badges.push({ key: level.key, code });
  }
  if (ex.support_equipment?.code) {
    badges.push({ key: "support", code: ex.support_equipment.code });
  }
  return badges;
}
