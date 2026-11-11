/**
 * The instant draft an exercise opens with: its template built with the default parameters, no
 * language model, no queue. Deterministic, so the same exercise always lands on the same poses.
 */

import { NEUTRAL_POSE, type LoopMode, type PoseAngles } from "./anatomy.ts";
import { DEFAULT_PARAMS, buildTemplate, templateFor, type TemplateExercise, type TemplateParams } from "./exercise-templates.ts";
import type { DraftOrigin } from "./pose-origin.ts";
import { normalizeParams } from "./template-settings.ts";

/** The catalog fields a template reads, as codes (what the sidebar's exercise carries). */
export type CatalogTemplateSource = {
  display_name: string;
  movement_type: { code: string } | null;
  position?: { code: string } | null;
  equipment: { code: string } | null;
  support_equipment: { code: string } | null;
  grip?: { code: string } | null;
};

export function templateExerciseOf(ex: CatalogTemplateSource): TemplateExercise {
  return {
    name: ex.display_name,
    movement: ex.movement_type?.code ?? null,
    position: ex.position?.code ?? null,
    equipment: ex.equipment?.code ?? null,
    support: ex.support_equipment?.code ?? null,
    grip: ex.grip?.code ?? null,
  };
}

/** Whether the exercise has a template of its own (the fallback "resting" counts only for Resting itself). */
export function hasTemplate(ex: TemplateExercise): boolean {
  return ex.movement !== null && (templateFor(ex) !== "resting" || ex.name === "Resting");
}

/** Everything the pose document needs to open on a draft (what replacePoses / startPoseEdit take). */
export type PoseDraft = {
  poses: PoseAngles[];
  labels: string[] | null;
  weights: number[] | null;
  mode: LoopMode;
  grip: string | null;
  twoHanded: boolean;
  meta: Record<string, unknown>;
  origin: DraftOrigin;
};

/**
 * The template draft of an exercise with the default parameters, or one neutral pose when the
 * exercise has no template. The meta carries what the body checks need (one side working, feet
 * leaving the floor) exactly as the server's draft does.
 */
export function defaultDraft(ex: TemplateExercise): PoseDraft {
  if (!hasTemplate(ex)) {
    return {
      poses: [structuredClone(NEUTRAL_POSE)],
      labels: null,
      weights: null,
      mode: "pingpong",
      grip: ex.grip,
      twoHanded: false,
      meta: {},
      origin: { kind: "neutral", reason: "no-template" },
    };
  }
  return templateDraft(ex, DEFAULT_PARAMS);
}

/**
 * Every pose of the exercise rebuilt from its template with these settings, in the browser: what
 * a change of setting (from its control or from a drag on the stage) puts in the editor. Settings
 * the template ignores are set back to the default, so the origin label names only what matters.
 */
export function templateDraft(ex: TemplateExercise, params: TemplateParams): PoseDraft {
  const settings = normalizeParams(ex, params);
  const built = buildTemplate(ex, settings);
  return {
    poses: structuredClone(built.poses),
    labels: [...built.labels],
    weights: [...built.weights],
    mode: built.mode,
    grip: ex.grip,
    // A template drives the arms itself: the bar does not lead them (as in the server's draft).
    twoHanded: false,
    meta: { template: built.id, template_params: { ...settings }, unilateral: built.unilateral, airborne: built.airborne, moving: built.moving },
    origin: { kind: "template", template: built.id, params: { ...settings } },
  };
}
