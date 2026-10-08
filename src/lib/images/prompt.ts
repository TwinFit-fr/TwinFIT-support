import type { MuscleMapTargetKind, MuscleMapView } from "./types";

type TemplateValues = {
  name: string;
  description: string;
  exo_id: number;
  id?: string;
  subject?: string;
  background_color?: string;
  /** Pre-built EXERCISE DETAILS block (see exerciseDetails); appended when non-empty. */
  details?: string;
};

type TaxonomyValue = {
  code?: string | null;
  name?: string | null;
  description?: string | null;
} | null | undefined;

export type ExerciseTaxonomy = {
  position?: TaxonomyValue;
  equipment?: TaxonomyValue;
  support_equipment?: TaxonomyValue;
  grip?: TaxonomyValue;
  variation?: TaxonomyValue;
};

function taxonomyLabel(value: TaxonomyValue): string | null {
  const name = value?.name?.trim();
  if (!name || name.toLowerCase() === "none" || value?.code?.toUpperCase() === "NONE") return null;
  const description = value?.description?.trim();
  const base = name.toLowerCase();
  return description ? `${base} — ${description}` : base;
}

/** Catalog fields that change the drawing, skipping empty or "none" values. */
export function exerciseDetails(exercise: ExerciseTaxonomy): string {
  const lines = [
    ["Body position", exercise.position],
    ["Equipment", exercise.equipment],
    ["Support equipment", exercise.support_equipment],
    ["Grip", exercise.grip],
    ["Variation", exercise.variation],
  ]
    .map(([label, value]) => {
      const text = taxonomyLabel(value as TaxonomyValue);
      return text ? `- ${label}: ${text}` : null;
    })
    .filter(Boolean);
  return lines.length
    ? `EXERCISE DETAILS (from the catalog, follow them):\n${lines.join("\n")}`
    : "";
}

/** Placeholders each group of prompt slots understands. */
export const PROMPT_PLACEHOLDERS = {
  exercise: ["{name}", "{description}", "{exo_id}", "{subject}", "{background_color}"],
  support: ["{support}", "{support_description}", "{background_color}"],
  muscleBase: ["{view}", "{background_color}"],
  muscleMap: [
    "{target}",
    "{target_kind}",
    "{target_description}",
    "{muscles}",
    "{view}",
    "{background_color}",
  ],
} as const;

export function fillPromptTemplate(
  template: string,
  values: TemplateValues & { support?: string; support_description?: string },
): string {
  return template
    .replaceAll("{name}", values.name)
    .replaceAll("{technical_description}", values.description)
    .replaceAll("{description}", values.description)
    .replaceAll("{exo_id}", String(values.exo_id))
    .replaceAll("{id}", values.id ?? String(values.exo_id))
    .replaceAll("{subject}", values.subject ?? "person")
    .replaceAll("{background_color}", values.background_color ?? "")
    .replaceAll("{support}", values.support ?? "")
    .replaceAll("{support_description}", values.support_description ?? "");
}

export function assembleImagePrompt(
  input: TemplateValues & { systemContent: string; positionContent: string },
): string {
  return [
    fillPromptTemplate(input.systemContent, input).trim(),
    fillPromptTemplate(input.positionContent, input).trim(),
    input.details ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type MuscleMapTarget = {
  kind: MuscleMapTargetKind;
  name: string;
  description: string | null;
  /** Muscles to highlight: the muscle itself, or the target muscles of the group / region. */
  muscles: { name: string; description: string | null }[];
};

const TARGET_KIND_LABEL: Record<MuscleMapTargetKind, string> = {
  muscle: "muscle",
  muscle_group: "muscle group",
  body_region: "body region",
};

type DescribedRow = { name: string; description?: string | null; active?: boolean };

export function muscleTarget(muscle: DescribedRow): MuscleMapTarget {
  const self = { name: muscle.name, description: muscle.description ?? null };
  return { kind: "muscle", ...self, muscles: [self] };
}

type GroupRow = DescribedRow & { group_muscles: { role: string; muscle: DescribedRow }[] };

/** The muscles whose canonical home is the group, not its secondary options. */
function groupTargetMuscles(group: GroupRow): MuscleMapTarget["muscles"] {
  return group.group_muscles
    .filter((link) => link.role === "target" && link.muscle.active !== false)
    .map((link) => ({ name: link.muscle.name, description: link.muscle.description ?? null }));
}

/** A group highlights its target muscles. */
export function muscleGroupTarget(group: GroupRow): MuscleMapTarget {
  return {
    kind: "muscle_group",
    name: group.name,
    description: group.description ?? null,
    muscles: groupTargetMuscles(group),
  };
}

/**
 * A body region highlights the target muscles of its active groups. Its description steers
 * regions that are not muscles (CARDIO: heart and lungs).
 */
export function bodyRegionTarget(
  region: DescribedRow & { muscle_groups: GroupRow[] },
): MuscleMapTarget {
  return {
    kind: "body_region",
    name: region.name,
    description: region.description ?? null,
    muscles: region.muscle_groups
      .filter((group) => group.active !== false)
      .flatMap(groupTargetMuscles),
  };
}

function describedLine(item: { name: string; description: string | null }): string {
  const description = item.description?.trim();
  return description ? `- ${item.name} — ${description}` : `- ${item.name}`;
}

/** Fill a muscle_base (no target) or muscle_map template. */
export function fillMuscleMapTemplate(
  template: string,
  values: { view: MuscleMapView; background_color?: string; target?: MuscleMapTarget },
): string {
  const target = values.target;
  return template
    .replaceAll("{view}", values.view)
    .replaceAll("{background_color}", values.background_color ?? "")
    .replaceAll("{target}", target?.name ?? "")
    .replaceAll("{target_kind}", target ? TARGET_KIND_LABEL[target.kind] : "")
    .replaceAll("{target_description}", target?.description?.trim() ?? "")
    .replaceAll("{muscles}", target ? target.muscles.map(describedLine).join("\n") : "")
    .trim();
}

/** Pick system + position prompts from a style's prompt list. */
export function selectedPrompts<T extends { kind: string; position: number | null }>(
  prompts: T[],
  position: number,
): { system: T | undefined; position: T | undefined } {
  return {
    system: prompts.find((p) => p.kind === "system"),
    position: prompts.find((p) => p.kind === "position" && p.position === position),
  };
}
