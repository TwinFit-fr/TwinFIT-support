/**
 * Where the poses in the editor came from, said in words the staff use. The origin is part of
 * the pose document (and of each undo step), so undo and redo bring back the right label
 * together with the poses it describes.
 */

import { DEFAULT_PARAMS } from "./exercise-templates.ts";
import { settingsSummary } from "./template-settings.ts";

/**
 * What the language model said about a draft, kept with its origin so it stays on screen (and
 * comes back with undo): its own notes, contradictions it found in the exercise texts, what was
 * clamped or set back after it answered, the server's body check, and the note it was given.
 */
export type AiNotes = {
  notes: string | null;
  conflicts: string[];
  adjusted: string[];
  checks: string[];
  instructions: string | null;
};

export type DraftOrigin =
  /** Built on the spot from the exercise's template with these settings (absent: the defaults). */
  | { kind: "template"; template: string; params?: Record<string, unknown> }
  /** Proposed by the language model: a template with the parameters it chose, or raw angles. */
  | { kind: "ai"; template: string | null; params: Record<string, unknown> | null; notes: string | null; explain?: AiNotes }
  /** A clip saved earlier (opened from the list, or just saved here); `from` says how it was made, when known. */
  | { kind: "clip"; vectorId: string; seq: number | null; from: string | null }
  /** One neutral standing pose: the exercise has no template, or the user started from scratch. */
  | { kind: "neutral"; reason: "no-template" | "scratch" };

/** "romanian_deadlift" -> "romanian deadlift". */
export function templateName(id: string): string {
  return id.replace(/_/g, " ");
}

/** The template parameters that differ from `defaults`, as short words ("deep range, wide stance, 3 s down"). */
export function paramSummary(params: Record<string, unknown> | null, defaults: Record<string, unknown>): string {
  return settingsSummary(params, defaults);
}

export type OriginLabel = {
  /** What the poses are: "Template: curl", "AI draft", "Saved clip #47", "Neutral pose". */
  base: string;
  /** How they were made, when there is something to add: "default settings", "squat template, deep range". */
  detail: string | null;
  /** The user changed something since. */
  edited: boolean;
  /** One line for a status or a screen reader: "Template: curl, default settings · Edited by you". */
  text: string;
};

export function originLabel(origin: DraftOrigin, edited: boolean, defaults: Record<string, unknown> = DEFAULT_PARAMS): OriginLabel {
  let base: string;
  let detail: string | null = null;
  switch (origin.kind) {
    case "template":
      base = `Template: ${templateName(origin.template)}`;
      detail = paramSummary(origin.params ?? null, defaults);
      break;
    case "ai":
      base = "AI draft";
      detail = origin.template ? `${templateName(origin.template)} template, ${paramSummary(origin.params, defaults)}` : "angles written by the model";
      break;
    case "clip":
      base = origin.seq !== null ? `Saved clip #${origin.seq}` : "Saved clip";
      detail = origin.from;
      break;
    case "neutral":
      base = "Neutral pose";
      detail = origin.reason === "no-template" ? "no template yet" : null;
      break;
  }
  const text = `${base}${detail ? `, ${detail}` : ""}${edited ? " · Edited by you" : ""}`;
  return { base, detail, edited, text };
}

/** How a clip being saved was made, kept on its label after the save ("curl template, edited"). */
export function savedFrom(origin: DraftOrigin, edited: boolean): string | null {
  const touched = edited ? ", edited" : "";
  switch (origin.kind) {
    case "template": {
      const settings = paramSummary(origin.params ?? null, DEFAULT_PARAMS);
      return `${templateName(origin.template)} template${settings === "default settings" ? "" : `, ${settings}`}${touched}`;
    }
    case "ai":
      return `AI draft${origin.template ? ` of the ${templateName(origin.template)} template` : ""}${touched}`;
    case "clip":
      return edited ? (origin.seq !== null ? `edited from #${origin.seq}` : "edited") : origin.from;
    case "neutral":
      return edited ? "posed by hand" : "neutral pose";
  }
}

/** How a saved clip was made, from what its file says (the template it was built from), when it says. */
export function clipFrom(meta: Record<string, unknown> | undefined): string | null {
  return typeof meta?.template === "string" && meta.template ? `${templateName(meta.template)} template` : null;
}

/** What the stage status says while the editor holds poses (instead of "No clip selected"). */
export function editingStatus(draft: { vectorId: string | null; sourceSeq: number | null; dirty: boolean }): string {
  if (!draft.vectorId) return "Editing poses · unsaved draft";
  const clip = draft.sourceSeq !== null ? `#${draft.sourceSeq}` : "clip";
  return draft.dirty ? `Editing ${clip} · unsaved changes` : `Editing ${clip} · saved`;
}
