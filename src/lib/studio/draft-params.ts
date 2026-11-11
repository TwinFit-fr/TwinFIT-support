/**
 * The template settings a draft stands for. A draft built from the template (instantly, by the AI,
 * or saved from either) carries them in its meta. A clip that does not (an older save, raw angles)
 * gets the settings whose template poses come nearest to its own, so the settings group shows
 * something true about it and a rebuild changes it as little as possible. Pure.
 */

import type { PoseAngles } from "./anatomy.ts";
import { DEFAULT_PARAMS, buildTemplate, type TemplateExercise, type TemplateParams } from "./exercise-templates.ts";
import { TEMPO_S, paramsFromMeta, settingsFor, tempoMatters } from "./template-settings.ts";

export type DraftLike = { poses: PoseAngles[]; meta: Record<string, unknown> | null | undefined; weights?: number[] | null };

/** Above this many combinations the nearest is not searched (no template comes near it today). */
const MAX_COMBOS = 400;

/** Sum of the differences between two poses: degrees for angles, centimetres for lengths. */
function difference(a: unknown, b: unknown, metres = false): number {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) * (metres ? 100 : 1);
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return 0;
  let sum = 0;
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) sum += difference((a as Record<string, unknown>)[k], v, k.endsWith("_m"));
  return sum;
}

/** How far a clip's poses are from a template's, pose by pose (a missing or extra pose counts heavily). */
export function posesDistance(a: PoseAngles[], b: PoseAngles[]): number {
  const n = Math.min(a.length, b.length);
  let sum = Math.abs(a.length - b.length) * 1000;
  for (let i = 0; i < n; i += 1) sum += difference(a[i], b[i]);
  return sum;
}

/** Every combination of this exercise's settings, the defaults first. */
function combinations(ex: TemplateExercise): TemplateParams[] {
  let out: TemplateParams[] = [{ ...DEFAULT_PARAMS }];
  for (const setting of settingsFor(ex)) {
    const values = setting.options.map((o) => o.value);
    out = out.flatMap((p) => values.map((value) => ({ ...p, [setting.key]: value }) as TemplateParams));
    if (out.length > MAX_COMBOS) return [{ ...DEFAULT_PARAMS }];
  }
  return out;
}

const nonDefault = (p: TemplateParams) => (["range", "stance", "grip", "lean", "side"] as const).filter((k) => p[k] !== DEFAULT_PARAMS[k]).length;

/**
 * The settings whose template comes nearest to these poses (ties go to the defaults), and the
 * tempo read back from the timing when the template's own timing gives exactly that.
 */
export function fitParams(ex: TemplateExercise, poses: PoseAngles[], weights: number[] | null = null): TemplateParams {
  let best: TemplateParams = { ...DEFAULT_PARAMS };
  let bestScore = Infinity;
  for (const p of combinations(ex)) {
    const score = posesDistance(poses, buildTemplate(ex, p).poses) + nonDefault(p) * 1e-3;
    if (score < bestScore) {
      best = p;
      bestScore = score;
    }
  }
  if (weights && weights.length === 2 && tempoMatters(ex)) {
    const round = (v: number) => Math.min(TEMPO_S.max, Math.max(TEMPO_S.min, Math.round(v / TEMPO_S.step) * TEMPO_S.step));
    const tempo = { ...best, up_s: round(weights[0]), down_s: round(weights[1]) };
    if (JSON.stringify(buildTemplate(ex, tempo).weights) === JSON.stringify(weights)) return tempo;
  }
  return best;
}

const fitted = new WeakMap<object, { ex: TemplateExercise; params: TemplateParams }>();

/** The draft's settings: from its meta when it says, else the nearest template's (worked out once per poses object). */
export function draftParams(ex: TemplateExercise, draft: DraftLike): TemplateParams {
  const given = draft.meta?.template_params;
  if (given && typeof given === "object") return paramsFromMeta(draft.meta);
  const seen = fitted.get(draft.poses);
  if (seen && seen.ex === ex) return seen.params;
  const params = fitParams(ex, draft.poses, draft.weights ?? null);
  fitted.set(draft.poses, { ex, params });
  return params;
}

/**
 * Whether the poses hold something that rebuilding them from the template would replace: they are
 * not what the template builds for the draft's own settings (a pose dragged or set with a slider,
 * a pose added or removed, a saved clip that was edited before it was saved).
 */
export function hasManualEdits(draft: DraftLike, ex: TemplateExercise): boolean {
  const built = buildTemplate(ex, draftParams(ex, draft)).poses;
  return JSON.stringify(built) !== JSON.stringify(draft.poses);
}
