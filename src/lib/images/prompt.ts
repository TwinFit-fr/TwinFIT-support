import { POSITION_PROMPT_KEYS } from "./types";
import type { SettingsSelection } from "./types";

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

export const PROMPT_PLACEHOLDERS = [
  "{name}",
  "{description}",
  "{exo_id}",
  "{subject}",
  "{background_color}",
  "{support}",
  "{support_description}",
] as const;

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

type PromptLike = { id: string; kind: string; position: number | null };

/** Prompts chosen in settings; falls back to the first of its kind if the selection was deleted. */
export function selectedPrompts<T extends PromptLike>(
  selection: SettingsSelection | null | undefined,
  prompts: T[],
  position: number,
): { system: T | undefined; position: T | undefined } {
  const systems = prompts.filter((p) => p.kind === "system");
  const forPosition = prompts.filter((p) => p.kind === "position" && p.position === position);
  const positionId = selection?.[POSITION_PROMPT_KEYS[position]];
  return {
    system: systems.find((p) => p.id === selection?.system_prompt_id) ?? systems[0],
    position: forPosition.find((p) => p.id === positionId) ?? forPosition[0],
  };
}
