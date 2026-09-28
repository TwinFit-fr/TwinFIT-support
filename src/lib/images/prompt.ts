export function fillPromptTemplate(
  template: string,
  values: {
    name: string;
    description: string;
    exo_id: number;
    id?: string;
  },
): string {
  return template
    .replaceAll("{name}", values.name)
    .replaceAll("{technical_description}", values.description)
    .replaceAll("{description}", values.description)
    .replaceAll("{exo_id}", String(values.exo_id))
    .replaceAll("{id}", values.id ?? String(values.exo_id));
}

export function assembleImagePrompt(input: {
  systemContent: string;
  exerciseContent: string;
  notes?: string | null;
  name: string;
  description: string;
  exo_id: number;
  id?: string;
  instruction?: string | null;
}): string {
  const values = {
    name: input.name,
    description: input.description,
    exo_id: input.exo_id,
    id: input.id,
  };
  const parts = [
    fillPromptTemplate(input.systemContent, values).trim(),
    fillPromptTemplate(input.exerciseContent, values).trim(),
  ];
  if (input.notes?.trim()) {
    parts.push(`Exercise-specific notes:\n${input.notes.trim()}`);
  }
  if (input.instruction?.trim()) {
    parts.push(`Refine instruction:\n${input.instruction.trim()}`);
  }
  return parts.filter(Boolean).join("\n\n");
}
