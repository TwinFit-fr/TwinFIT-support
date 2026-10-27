/**
 * The local draft of one Coach suggestion (prompt chip or lesson): metadata plus every locale's
 * text and answer. Nothing here touches the backend; `planSave` turns the difference between the
 * saved suggestion and the draft into the API calls Save has to make, so the page can tell the
 * person exactly what Save will persist.
 */
import {
  ANSWER_MD_MAX,
  LOCALES,
  SUGGESTION_TEXT_MAX,
  type Locale,
  type Suggestion,
} from "./types.ts";
import { findImages } from "./markdown.ts";

export type DraftLocalization = { text: string; answer_md: string };

export type DraftMeta = {
  active: boolean;
  requires_personal_data: boolean;
  requires_plan_builder: boolean;
  unlocks_after: string;
  section_slug: string;
  sort_order: number;
};

export type LessonDraft = DraftMeta & {
  /** A locale missing here has no localization (and Save deletes it if the server has one). */
  localizations: Partial<Record<Locale, DraftLocalization>>;
};

export const META_KEYS = [
  "active",
  "requires_personal_data",
  "requires_plan_builder",
  "unlocks_after",
  "section_slug",
  "sort_order",
] as const satisfies readonly (keyof DraftMeta)[];

export function draftFromSuggestion(suggestion: Suggestion): LessonDraft {
  const localizations: LessonDraft["localizations"] = {};
  for (const row of suggestion.localizations) {
    if ((LOCALES as readonly string[]).includes(row.locale)) {
      localizations[row.locale as Locale] = { text: row.text, answer_md: row.answer_md ?? "" };
    }
  }
  return {
    active: suggestion.active,
    requires_personal_data: suggestion.requires_personal_data,
    requires_plan_builder: suggestion.requires_plan_builder,
    unlocks_after: suggestion.unlocks_after ?? "",
    section_slug: suggestion.section_slug ?? "",
    sort_order: suggestion.sort_order,
    localizations,
  };
}

export function emptyLocalization(): DraftLocalization {
  return { text: "", answer_md: "" };
}

function sameLocalization(a: DraftLocalization | undefined, b: DraftLocalization | undefined) {
  if (!a || !b) return !a && !b;
  return a.text === b.text && a.answer_md.trim() === b.answer_md.trim();
}

export function metaChanged(base: DraftMeta, draft: DraftMeta): boolean {
  return META_KEYS.some((key) => String(base[key]).trim() !== String(draft[key]).trim());
}

/** Locales whose text or answer differ from `base` (added, edited or removed). */
export function changedLocales(base: LessonDraft, draft: LessonDraft): Locale[] {
  return LOCALES.filter((locale) => !sameLocalization(base.localizations[locale], draft.localizations[locale]));
}

export function isDirty(base: LessonDraft, draft: LessonDraft): boolean {
  return metaChanged(base, draft) || changedLocales(base, draft).length > 0;
}

export type DraftProblem = { locale: Locale | null; message: string };

/** Problems that block Save. */
export function validateDraft(draft: LessonDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!draft.localizations.en) {
    problems.push({ locale: "en", message: "The en localization is required." });
  }
  for (const locale of LOCALES) {
    const loc = draft.localizations[locale];
    if (!loc) continue;
    const text = loc.text.trim();
    if (!text) problems.push({ locale, message: `${locale}: chip text is required.` });
    if (text.length > SUGGESTION_TEXT_MAX) {
      problems.push({ locale, message: `${locale}: chip text exceeds ${SUGGESTION_TEXT_MAX} characters.` });
    }
    if (loc.answer_md.length > ANSWER_MD_MAX) {
      problems.push({ locale, message: `${locale}: answer_md exceeds ${ANSWER_MD_MAX} characters.` });
    }
  }
  if (!Number.isFinite(draft.sort_order)) {
    problems.push({ locale: null, message: "Sort order must be a number." });
  }
  return problems;
}

export type LocaleStatus = "missing" | "no-answer" | "complete";

/** How finished a locale is: missing, text without an answer while en has one, or complete. */
export function localeStatus(draft: LessonDraft, locale: Locale): LocaleStatus {
  const loc = draft.localizations[locale];
  if (!loc || !loc.text.trim()) return "missing";
  const enHasAnswer = Boolean(draft.localizations.en?.answer_md.trim());
  if (enHasAnswer && !loc.answer_md.trim()) return "no-answer";
  return "complete";
}

// ---- Pending images ----------------------------------------------------------------------------

export const PENDING_URL_PREFIX = "pending:";

export function pendingUrl(id: string): string {
  return `${PENDING_URL_PREFIX}${id}`;
}

export function pendingIdFromUrl(url: string): string | null {
  return url.startsWith(PENDING_URL_PREFIX) ? url.slice(PENDING_URL_PREFIX.length) : null;
}

/** Ids of pending (not yet uploaded) images referenced anywhere in the draft. */
export function referencedPendingIds(draft: LessonDraft): Set<string> {
  const ids = new Set<string>();
  for (const loc of Object.values(draft.localizations)) {
    if (!loc) continue;
    for (const image of findImages(loc.answer_md)) {
      const id = pendingIdFromUrl(image.url);
      if (id) ids.add(id);
    }
  }
  return ids;
}

// ---- Save plan ---------------------------------------------------------------------------------

export type SaveStep =
  | { kind: "update_meta"; meta: DraftMeta }
  | { kind: "upsert_localization"; locale: Locale; text: string; answer_md: string | null }
  | { kind: "delete_localization"; locale: Locale };

export type SavePlan = {
  steps: SaveStep[];
  /** Pending image ids that must be uploaded before the localizations are written. */
  uploads: string[];
  /** Storage URLs that `base` referenced and the draft no longer does. */
  droppedUrls: string[];
  /** Human summary of what Save persists, e.g. ["flags", "en", "es"]. */
  summary: string[];
};

export function planSave(base: LessonDraft, draft: LessonDraft): SavePlan {
  const steps: SaveStep[] = [];
  const summary: string[] = [];
  if (metaChanged(base, draft)) {
    const meta: DraftMeta = {
      active: draft.active,
      requires_personal_data: draft.requires_personal_data,
      requires_plan_builder: draft.requires_plan_builder,
      unlocks_after: draft.unlocks_after.trim(),
      section_slug: draft.section_slug.trim(),
      sort_order: draft.sort_order,
    };
    steps.push({ kind: "update_meta", meta });
    summary.push("flags");
  }
  const uploads = new Set<string>();
  for (const locale of changedLocales(base, draft)) {
    const loc = draft.localizations[locale];
    if (!loc) {
      steps.push({ kind: "delete_localization", locale });
      summary.push(`${locale} (remove)`);
      continue;
    }
    for (const image of findImages(loc.answer_md)) {
      const id = pendingIdFromUrl(image.url);
      if (id) uploads.add(id);
    }
    steps.push({
      kind: "upsert_localization",
      locale,
      text: loc.text.trim(),
      answer_md: loc.answer_md.trim() || null,
    });
    summary.push(locale);
  }
  const before = new Set<string>();
  for (const loc of Object.values(base.localizations)) {
    if (loc) for (const image of findImages(loc.answer_md)) before.add(image.url);
  }
  const after = new Set<string>();
  for (const loc of Object.values(draft.localizations)) {
    if (loc) for (const image of findImages(loc.answer_md)) after.add(image.url);
  }
  const droppedUrls = [...before].filter((url) => !after.has(url) && !pendingIdFromUrl(url));
  return { steps, uploads: [...uploads], droppedUrls, summary };
}

/** The storage file id of a `{storageUrl}/files/{id}` URL, or null for any other URL. */
export function storageFileId(url: string): string | null {
  const match = url.match(/\/v1\/files\/([0-9a-fA-F-]{36})(?:[?#].*)?$/);
  return match ? match[1] : null;
}

/** Whether `url` appears in any localization of any suggestion other than `exceptId`. */
export function urlReferencedElsewhere(
  suggestions: readonly Suggestion[],
  exceptId: string,
  url: string,
): boolean {
  return suggestions.some(
    (row) =>
      row.id !== exceptId && row.localizations.some((loc) => (loc.answer_md ?? "").includes(url)),
  );
}
