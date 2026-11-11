/**
 * The settings of an exercise's template, as the pose editor shows them: which of them change
 * something for this exercise, their choices in plain words, the current settings of a draft and
 * the words the origin label uses for them. Pure: the template builds the poses, this only reads it.
 */

import type { PoseAngles } from "./anatomy.ts";
import { DEFAULT_PARAMS, GRIPS, LEANS, RANGES, SIDES, STANCES, buildTemplate, type TemplateExercise, type TemplateParams } from "./exercise-templates.ts";

/** The settings chosen from a list (tempo is two numbers, see tempoMatters). */
export const CHOICE_KEYS = ["range", "stance", "grip", "lean", "side"] as const;
export type ChoiceKey = (typeof CHOICE_KEYS)[number];

export const CHOICES: Record<ChoiceKey, readonly string[]> = { range: RANGES, stance: STANCES, grip: GRIPS, lean: LEANS, side: SIDES };

export const SETTING_LABEL: Record<ChoiceKey | "tempo", string> = { range: "Range", stance: "Stance", grip: "Grip", lean: "Lean", side: "Side", tempo: "Tempo" };

/** What each choice is called on its button. */
const VALUE_LABEL: Record<string, string> = {
  partial: "Partial",
  full: "Full",
  deep: "Deep",
  narrow: "Narrow",
  hip: "Hip",
  shoulder: "Shoulder",
  wide: "Wide",
  upright: "Upright",
  moderate: "Moderate",
  forward: "Forward",
  both: "Both",
  left: "Left",
  right: "Right",
  alternate: "Alternate",
};

/** What a choice means, for its tooltip. */
const VALUE_HINT: Partial<Record<ChoiceKey, Record<string, string>>> = {
  range: { partial: "A shorter movement", full: "The usual range of the exercise", deep: "As far as the joints allow" },
  stance: { narrow: "Feet together", hip: "Feet hip-width apart", shoulder: "Feet shoulder-width apart", wide: "Feet wider than the shoulders, toes out" },
  grip: { narrow: "Hands close together", shoulder: "Hands shoulder-width apart", wide: "Hands wider than the shoulders" },
  lean: { upright: "Trunk more upright", moderate: "The usual trunk angle", forward: "Trunk leaning further forward" },
  side: { left: "The left side works", right: "The right side works" },
};

export function valueLabel(value: string): string {
  return VALUE_LABEL[value] ?? value;
}

export function valueHint(key: ChoiceKey, value: string): string | undefined {
  return VALUE_HINT[key]?.[value];
}

/** Which choice stands for a group of choices that build the same poses: the default first, a named side before "both". */
function preference(key: ChoiceKey): readonly string[] {
  if (key === "side") return ["left", "right", "both", "alternate"];
  const values = CHOICES[key];
  const fallback = DEFAULT_PARAMS[key];
  return [fallback, ...values.filter((v) => v !== fallback)];
}

export type SettingOption = {
  /** The choice the button applies. */
  value: string;
  /** Every choice that builds the same poses as this one (the current setting may be any of them). */
  covers: string[];
  label: string;
  hint?: string;
};

export type Setting = { key: ChoiceKey; label: string; options: SettingOption[] };

const posesKey = (poses: PoseAngles[]) => JSON.stringify(poses);

/** settingsFor with the default base, once per exercise object (the stage and the panel ask often). */
const settingsSeen = new WeakMap<TemplateExercise, Setting[]>();

/**
 * The settings that change the poses of this exercise, each with only the choices that build
 * different poses (in their natural order). A setting the template ignores is left out, and so is a
 * choice that builds the same poses as another one (a split squat's "both" is its left leg).
 */
export function settingsFor(ex: TemplateExercise, base: TemplateParams = DEFAULT_PARAMS): Setting[] {
  const cached = base === DEFAULT_PARAMS ? settingsSeen.get(ex) : undefined;
  if (cached) return cached;
  const out: Setting[] = [];
  for (const key of CHOICE_KEYS) {
    const groups = new Map<string, string[]>();
    for (const value of CHOICES[key]) {
      const k = posesKey(buildTemplate(ex, { ...base, [key]: value }).poses);
      groups.set(k, [...(groups.get(k) ?? []), value]);
    }
    if (groups.size < 2) continue;
    const order = preference(key);
    const options = [...groups.values()]
      .map((covers) => {
        const value = [...covers].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
        return { value, covers, label: valueLabel(value), hint: valueHint(key, value) };
      })
      .sort((a, b) => CHOICES[key].indexOf(a.value) - CHOICES[key].indexOf(b.value));
    out.push({ key, label: SETTING_LABEL[key], options });
  }
  if (base === DEFAULT_PARAMS) settingsSeen.set(ex, out);
  return out;
}

/** The option of a setting that holds this value (its button shows as chosen). */
export function optionOf(setting: Setting, value: string): SettingOption | undefined {
  return setting.options.find((o) => o.covers.includes(value));
}

/** Whether the tempo settings change the timing of this exercise (a repetition with two phases does; a loop at an even pace does not). */
export function tempoMatters(ex: TemplateExercise): boolean {
  const a = buildTemplate(ex, { ...DEFAULT_PARAMS, down_s: 3, up_s: 1 }).weights;
  const b = buildTemplate(ex, DEFAULT_PARAMS).weights;
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** Tempo limits, seconds per phase. */
export const TEMPO_S = { min: 0.5, max: 6, step: 0.5 } as const;

/**
 * The settings a draft was built with, from its meta (what the server's AI draft and the instant
 * draft store); anything missing or out of range falls back to the default.
 */
export function paramsFromMeta(meta: Record<string, unknown> | null | undefined): TemplateParams {
  const given = meta?.template_params;
  const source = given && typeof given === "object" ? (given as Record<string, unknown>) : {};
  const params: TemplateParams = { ...DEFAULT_PARAMS };
  for (const key of CHOICE_KEYS) {
    const value = source[key];
    if (typeof value === "string" && CHOICES[key].includes(value)) (params as Record<string, unknown>)[key] = value;
  }
  for (const key of ["down_s", "up_s"] as const) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) params[key] = Math.min(TEMPO_S.max, Math.max(TEMPO_S.min, value));
  }
  return params;
}

/**
 * The settings with everything this exercise ignores set back to the default, so the origin label
 * names only what changes something ("forward lean" means nothing for a curl).
 */
export function normalizeParams(ex: TemplateExercise, params: TemplateParams): TemplateParams {
  const out: TemplateParams = { ...DEFAULT_PARAMS };
  for (const setting of settingsFor(ex)) (out as Record<string, unknown>)[setting.key] = params[setting.key];
  if (tempoMatters(ex)) {
    out.down_s = params.down_s;
    out.up_s = params.up_s;
  }
  return out;
}

const WORDS: Record<ChoiceKey, (v: string) => string> = {
  range: (v) => `${v} range`,
  stance: (v) => `${v} stance`,
  grip: (v) => `${v} grip`,
  lean: (v) => `${v} lean`,
  side: (v) => (v === "both" ? "both sides" : `${v} side`),
};

const seconds = (v: number) => `${Number(v.toFixed(1))} s`;

/**
 * The settings that differ from the defaults, as short words for the origin label: "deep range,
 * wide stance", "3 s down"; "default settings" when there is nothing to say.
 */
export function settingsSummary(params: Record<string, unknown> | null | undefined, defaults: Record<string, unknown> = DEFAULT_PARAMS): string {
  if (!params) return "default settings";
  const words: string[] = [];
  for (const key of CHOICE_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value !== defaults[key]) words.push(WORDS[key](value));
  }
  for (const [key, word] of [["down_s", "down"], ["up_s", "up"]] as const) {
    const value = params[key];
    if (typeof value === "number" && value !== defaults[key]) words.push(`${seconds(value)} ${word}`);
  }
  return words.length ? words.join(", ") : "default settings";
}

/** What changed between two sets of settings, in words for the stage ("Range: deep"); null when nothing did. */
export function settingChange(from: TemplateParams, to: TemplateParams): string | null {
  const parts: string[] = [];
  for (const key of CHOICE_KEYS) if (from[key] !== to[key]) parts.push(`${SETTING_LABEL[key]}: ${valueLabel(to[key]).toLowerCase()}`);
  if (from.down_s !== to.down_s || from.up_s !== to.up_s) parts.push(`Tempo: ${seconds(to.down_s)} down, ${seconds(to.up_s)} up`);
  return parts.length ? parts.join(", ") : null;
}
