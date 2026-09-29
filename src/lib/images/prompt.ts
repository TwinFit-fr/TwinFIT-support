import { POSITION_PROMPT_KEYS } from "./types";
import type { SettingsSelection } from "./types";

type TemplateValues = {
  name: string;
  description: string;
  exo_id: number;
  id?: string;
  subject?: string;
  background_color?: string;
};

export const PROMPT_PLACEHOLDERS = [
  "{name}",
  "{description}",
  "{exo_id}",
  "{subject}",
  "{background_color}",
] as const;

export function fillPromptTemplate(template: string, values: TemplateValues): string {
  return template
    .replaceAll("{name}", values.name)
    .replaceAll("{technical_description}", values.description)
    .replaceAll("{description}", values.description)
    .replaceAll("{exo_id}", String(values.exo_id))
    .replaceAll("{id}", values.id ?? String(values.exo_id))
    .replaceAll("{subject}", values.subject ?? "person")
    .replaceAll("{background_color}", values.background_color ?? "");
}

export function assembleImagePrompt(
  input: TemplateValues & {
    systemContent: string;
    positionContent: string;
    notes?: string | null;
    instruction?: string | null;
  },
): string {
  const parts = [
    fillPromptTemplate(input.systemContent, input).trim(),
    fillPromptTemplate(input.positionContent, input).trim(),
  ];
  if (input.notes?.trim()) {
    parts.push(`Exercise-specific notes:\n${input.notes.trim()}`);
  }
  if (input.instruction?.trim()) {
    parts.push(`Refine instruction:\n${input.instruction.trim()}`);
  }
  return parts.filter(Boolean).join("\n\n");
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
