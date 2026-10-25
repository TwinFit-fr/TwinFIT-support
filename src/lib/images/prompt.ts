type TemplateValues = {
  name: string;
  description: string;
  /** Exact pose of the frame being drawn; falls back to the description when missing. */
  pose?: string;
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
  exercise: ["{name}", "{description}", "{pose}", "{exo_id}", "{subject}", "{background_color}"],
  support: ["{support}", "{support_description}", "{background_color}"],
  equipment: ["{equipment}", "{equipment_description}", "{background_color}"],
} as const;

export function fillPromptTemplate(
  template: string,
  values: TemplateValues & {
    support?: string;
    support_description?: string;
    equipment?: string;
    equipment_description?: string;
  },
): string {
  return template
    .replaceAll("{name}", values.name)
    .replaceAll("{technical_description}", values.description)
    .replaceAll("{description}", values.description)
    .replaceAll("{pose}", values.pose?.trim() || values.description)
    .replaceAll("{exo_id}", String(values.exo_id))
    .replaceAll("{id}", values.id ?? String(values.exo_id))
    .replaceAll("{subject}", values.subject ?? "person")
    .replaceAll("{background_color}", values.background_color ?? "")
    .replaceAll("{support}", values.support ?? "")
    .replaceAll("{support_description}", values.support_description ?? "")
    .replaceAll("{equipment}", values.equipment ?? "")
    .replaceAll("{equipment_description}", values.equipment_description ?? "");
}

/** The catalog text a frame prompt takes from the exercise, and the pose of its frame. */
export type ExerciseText = {
  id: string;
  exo_id: number;
  name: string;
  description: string;
  pose: string;
};

/**
 * Fills a frame template with the exercise's own text, so it reads as the prompt that is sent.
 * `{subject}` and `{background_color}` stay: a run may draw several subjects, and the style sets
 * the color.
 */
export function fillExerciseText(template: string, exercise: ExerciseText): string {
  return fillPromptTemplate(template, {
    ...exercise,
    subject: "{subject}",
    background_color: "{background_color}",
  });
}

/** Puts the exercise's placeholders back into a run's text, so it can be saved as a style template. */
export function unfillExerciseText(text: string, exercise: ExerciseText): string {
  const replacements: [string, string][] = [
    [exercise.pose, "{pose}"],
    [exercise.description, "{description}"],
    [exercise.name, "{name}"],
    [exercise.id, "{id}"],
  ];
  let result = text;
  for (const [value, placeholder] of replacements) {
    if (value.trim()) result = result.replaceAll(value, placeholder);
  }
  return result.replace(new RegExp(`\\b${exercise.exo_id}\\b`, "g"), "{exo_id}");
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
