/**
 * The AI draft's answer, turned into what the editor shows and applies. For an exercise with a
 * template the model only chooses the template's settings, so the answer is applied exactly as if
 * the user had set them: the poses are rebuilt here from those settings and the settings group
 * shows them. What the model said (notes, contradictions in the texts, values clamped or set back,
 * the server's body check) is kept with the origin. Pure.
 */

import type { LoopMode, PoseAngles } from "./anatomy.ts";
import { draftParams, hasManualEdits } from "./draft-params.ts";
import { buildTemplate, type TemplateExercise } from "./exercise-templates.ts";
import type { AiNotes, DraftOrigin } from "./pose-origin.ts";
import { automaticDraft, keepSetByYou, keptSummary } from "./point-state.ts";
import { hasTemplate, templateDraft } from "./template-draft.ts";
import { CHOICE_KEYS, SETTING_LABEL, normalizeParams, paramsFromMeta, settingChange, valueLabel } from "./template-settings.ts";

/** What POST /api/studio/poses/draft returns in `draft` (the fields the editor reads). */
export type AiDraftResponse = {
  poses: PoseAngles[];
  labels: string[];
  weights: number[];
  mode: LoopMode;
  notes: string;
  grip: string | null;
  template: string | null;
  params: Record<string, unknown> | null;
  conflicts?: string[] | null;
  clamped?: string[] | null;
  raw?: string | null;
  unilateral: boolean;
  airborne: boolean;
  moving: boolean;
  check?: { ok: boolean; issues: { message: string }[] } | null;
};

/** What replacePoses takes to put the answer in the editor (one undo step). */
export type AiReplacement = {
  poses: PoseAngles[];
  labels: string[] | null;
  weights: number[] | null;
  mode: LoopMode;
  grip: string | null;
  twoHanded?: boolean;
  meta: Record<string, unknown>;
  origin: Extract<DraftOrigin, { kind: "ai" }>;
  keyframe: number;
  /** What was set by hand was kept on these poses (keepHandWork): they still count as edited. */
  edited?: boolean;
};

type EditLike = { poses: PoseAngles[]; labels: string[] | null; weights: number[] | null; meta: Record<string, unknown>; origin: DraftOrigin; edited: boolean };

const FELL_BACK = "The chosen parameters did not hold up as a body: template defaults used.";

const strings = (list: unknown): string[] => (Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))] : []);

const templated = (ex: TemplateExercise | null): ex is TemplateExercise => Boolean(ex && hasTemplate(ex));

function rawChoice(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The settings the answer stands for, as the settings group reads them (null: raw angles). */
export function aiParams(draft: AiDraftResponse, ex: TemplateExercise | null) {
  if (!draft.template || !draft.params || !templated(ex)) return null;
  return normalizeParams(ex, paramsFromMeta({ template_params: draft.params }));
}

/** What the model said and what was changed after it answered, in plain lines. */
export function aiNotesOf(draft: AiDraftResponse, ex: TemplateExercise | null, instructions: string | null = null): AiNotes {
  const conflicts = strings(draft.conflicts);
  const fellBack = draft.notes.includes(FELL_BACK);
  let notes = draft.notes.replace(FELL_BACK, "");
  for (const c of conflicts) notes = notes.replace(c, "");
  const adjusted: string[] = [];
  if (fellBack) adjusted.push("The settings it chose did not pass the body check, so the template's defaults were used.");
  adjusted.push(...strings(draft.clamped));
  const params = aiParams(draft, ex);
  const said = rawChoice(draft.raw);
  if (params && said && !fellBack) {
    for (const key of CHOICE_KEYS) {
      const value = said[key];
      if (typeof value === "string" && value !== params[key]) adjusted.push(`${SETTING_LABEL[key]} ${valueLabel(value).toLowerCase()}: not a setting of this exercise, left at ${valueLabel(params[key]).toLowerCase()}.`);
    }
    for (const [key, word] of [["down_s", "down"], ["up_s", "up"]] as const) {
      const value = said[key];
      if (typeof value === "number" && Number.isFinite(value) && Math.abs(value - params[key]) > 1e-6) adjusted.push(`Tempo ${value} s ${word}: clamped to ${params[key]} s.`);
    }
  }
  const checks = draft.check && !draft.check.ok ? strings(draft.check.issues.map((i) => i.message)) : [];
  return { notes: notes.replace(/\s+/g, " ").trim() || null, conflicts, adjusted, checks, instructions: instructions?.trim() || null };
}

/** The answer as editor content: settings rebuilt here for a templated exercise, the model's angles otherwise. */
export function aiReplacement(draft: AiDraftResponse, ex: TemplateExercise | null, keyframe: number, instructions: string | null = null): AiReplacement {
  const explain = aiNotesOf(draft, ex, instructions);
  const params = aiParams(draft, ex);
  if (params && templated(ex)) {
    const built = templateDraft(ex, params);
    const template = built.origin.kind === "template" ? built.origin.template : draft.template;
    return {
      poses: built.poses,
      labels: built.labels,
      weights: built.weights,
      mode: built.mode,
      grip: built.grip,
      twoHanded: built.twoHanded,
      meta: built.meta,
      origin: { kind: "ai", template, params: { ...params }, notes: explain.notes, explain },
      keyframe: Math.min(keyframe, built.poses.length - 1),
    };
  }
  return {
    poses: draft.poses,
    labels: draft.labels,
    weights: draft.weights,
    mode: draft.mode,
    grip: draft.grip,
    meta: { template: null, template_params: null, unilateral: draft.unilateral, airborne: draft.airborne, moving: draft.moving },
    origin: { kind: "ai", template: null, params: null, notes: explain.notes, explain },
    keyframe: Math.min(keyframe, draft.poses.length - 1),
  };
}

/**
 * The answer with what was set by hand kept on it, when it is built on the template and each pose
 * matches its automatic pose (point-state.ts): joints, pins and typed names stay, the rest is the
 * AI's. Null when nothing can be matched; the answer then replaces the poses (or waits as a
 * suggestion, see handMadeWork).
 */
export function keepHandWork(edit: EditLike & { twoHanded?: boolean }, ex: TemplateExercise | null, next: AiReplacement): { next: AiReplacement; kept: string | null } | null {
  if (!next.origin.template || !templated(ex)) return null;
  const keep = keepSetByYou(edit, automaticDraft(ex, edit), next);
  if (!keep) return null;
  const twoHanded = keep.edited && edit.twoHanded !== undefined ? { twoHanded: edit.twoHanded } : {};
  return { next: { ...keep.next, ...twoHanded, edited: keep.edited }, kept: keptSummary(keep.kept) };
}

/** Names the user typed that the template would not give these poses. */
function typedNames(edit: EditLike, ex: TemplateExercise | null): boolean {
  const names = (edit.labels ?? []).map((l) => l.trim());
  if (!names.some(Boolean)) return false;
  if (!templated(ex)) return edit.edited;
  const built = buildTemplate(ex, draftParams(ex, edit)).labels;
  return names.some((name, i) => name !== "" && name !== built[i]);
}

/** Indices of the poses that are not what the template builds for their settings (all of them when the count differs). */
function editedPoses(edit: EditLike, ex: TemplateExercise): number[] {
  const built = buildTemplate(ex, draftParams(ex, edit)).poses;
  if (built.length !== edit.poses.length) return edit.poses.map((_, i) => i);
  return edit.poses.flatMap((pose, i) => (JSON.stringify(pose) === JSON.stringify(built[i]) ? [] : [i]));
}

/**
 * Whether the poses hold work made by hand that applying an answer would replace: for a templated
 * exercise, poses that are not the template's for their settings (a hand edit, a hand-tuned saved
 * clip) or names the user typed; otherwise any edit, or a saved clip.
 */
export function handMadeWork(edit: EditLike, ex: TemplateExercise | null): boolean {
  if (templated(ex)) return hasManualEdits(edit, ex) || typedNames(edit, ex);
  return edit.edited || edit.origin.kind === "clip";
}

/** "pose 2", "poses 1 and 3", "poses 1, 2 and 4". */
export function posesPhrase(indices: number[]): string {
  const n = indices.map((i) => String(i + 1));
  if (n.length === 1) return `pose ${n[0]}`;
  return `poses ${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

const listPhrase = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

/** One line under a suggestion: what applying it replaces, and the settings it sets. */
export function replacementSummary(edit: EditLike, next: AiReplacement, ex: TemplateExercise | null): string {
  const n = edit.poses.length;
  const what: string[] = [];
  if (edit.origin.kind === "clip" && !edit.edited) {
    what.push(`the ${n} hand-tuned pose${n === 1 ? "" : "s"} of saved clip${edit.origin.seq !== null ? ` #${edit.origin.seq}` : ""}`);
  } else if (templated(ex)) {
    const edited = editedPoses(edit, ex);
    if (edited.length === n && n > 1) what.push(`your ${n} hand-edited poses`);
    else if (edited.length) what.push(`your edits on ${posesPhrase(edited)}`);
  } else {
    what.push(`your ${n} pose${n === 1 ? "" : "s"}`);
  }
  if (typedNames(edit, ex)) what.push("the pose names you typed");
  const m = next.poses.length;
  const settings = templated(ex) && next.origin.params ? settingChange(draftParams(ex, edit), normalizeParams(ex, paramsFromMeta({ template_params: next.origin.params }))) : null;
  const replaces = what.length ? `replaces ${listPhrase(what)}${m !== n ? ` with the AI's ${m}` : ""}` : null;
  const sets = settings ? `sets ${settings}` : null;
  const body = [replaces, sets].filter(Boolean).join(" and ");
  return body ? `Applying ${body}.` : "Applying changes nothing you made by hand.";
}
