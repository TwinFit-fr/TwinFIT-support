import { DEFAULT_GENERATION_PARAMS } from "@/lib/images/capabilities";
import type { GenerationParams } from "@/lib/images/types";
import type { MapMuscle, MapView, MuscleMapSettings } from "./types";

/**
 * The settings' model params, completed with the defaults: the stored ones may omit fields
 * (e.g. compression, background_color) that the request builder requires.
 */
export function generationParams(settings: MuscleMapSettings): GenerationParams {
  return { ...DEFAULT_GENERATION_PARAMS, ...settings.generation };
}

/** Replaces `{name}` placeholders; unknown ones are left as they are. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

export function basePrompt(settings: MuscleMapSettings, view: MapView): string {
  return fillTemplate(settings.base_prompt, { view });
}

export function maskPrompt(settings: MuscleMapSettings, muscle: MapMuscle): string {
  return fillTemplate(settings.mask_prompt, {
    view: muscle.view,
    muscle: muscle.muscle.name,
    muscle_description: muscle.muscle.description?.trim() ?? "",
    key_color: settings.key_color,
  });
}
