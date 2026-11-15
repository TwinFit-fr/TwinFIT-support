/**
 * The local draft of one article: metadata plus the four locales. Nothing here touches the
 * backend. `validateDraft` says what blocks Save, `draftWarnings` what is only worth a look, and
 * `planSave` turns the difference between the saved article and the draft into the calls Save
 * has to make.
 *
 * A locale whose three fields are blank counts as absent: Save deletes it when the server has it.
 * The `en` locale is required (the backend rejects an article without it), so a blank `en` blocks.
 */
import { LOCALES, type Locale } from "../coach/types.ts";
import { imageMarkdown } from "../coach/markdown.ts";
import {
  ARTICLE_BODY_MAX,
  ARTICLE_COVER_MAX,
  ARTICLE_SLUG_MAX,
  ARTICLE_SLUG_PATTERN,
  ARTICLE_SUMMARY_MAX,
  ARTICLE_TITLE_MAX,
  type Article,
  type ArticleKind,
  type ArticleStatus,
} from "./types.ts";

export type DraftLocalization = { title: string; summary: string; body_md: string };

export type ArticleDraft = {
  slug: string;
  kind: ArticleKind;
  active: boolean;
  /** ISO timestamp, or null for a draft. */
  published_at: string | null;
  /** Empty = no cover. */
  cover_image_url: string;
  localizations: Record<Locale, DraftLocalization>;
};

export const META_KEYS = ["slug", "kind", "active", "published_at", "cover_image_url"] as const satisfies readonly (keyof ArticleDraft)[];

export function emptyLocalization(): DraftLocalization {
  return { title: "", summary: "", body_md: "" };
}

export function emptyDraft(kind: ArticleKind = "app_update"): ArticleDraft {
  return {
    slug: "",
    kind,
    active: true,
    published_at: null,
    cover_image_url: "",
    localizations: { en: emptyLocalization(), es: emptyLocalization(), fr: emptyLocalization(), de: emptyLocalization() },
  };
}

export function draftFromArticle(article: Article): ArticleDraft {
  const draft = emptyDraft(article.kind);
  draft.slug = article.slug;
  draft.active = article.active;
  draft.published_at = article.published_at;
  draft.cover_image_url = article.cover_image_url ?? "";
  for (const row of article.localizations) {
    if ((LOCALES as readonly string[]).includes(row.locale)) {
      draft.localizations[row.locale] = { title: row.title, summary: row.summary ?? "", body_md: row.body_md };
    }
  }
  return draft;
}

export function isBlankLocalization(loc: DraftLocalization): boolean {
  return loc.title.trim() === "" && loc.summary.trim() === "" && loc.body_md.trim() === "";
}

/** Locales that have content in the draft. */
export function presentLocales(draft: ArticleDraft): Locale[] {
  return LOCALES.filter((locale) => !isBlankLocalization(draft.localizations[locale]));
}

function sameLocalization(a: DraftLocalization, b: DraftLocalization): boolean {
  return a.title === b.title && a.summary === b.summary && a.body_md === b.body_md;
}

export function metaChanged(base: ArticleDraft, draft: ArticleDraft): boolean {
  return META_KEYS.some((key) => base[key] !== draft[key]);
}

export function changedLocales(base: ArticleDraft, draft: ArticleDraft): Locale[] {
  return LOCALES.filter((locale) => !sameLocalization(base.localizations[locale], draft.localizations[locale]));
}

export function isDirty(base: ArticleDraft, draft: ArticleDraft): boolean {
  return metaChanged(base, draft) || changedLocales(base, draft).length > 0;
}

/** The draft as Save sends it: texts and cover trimmed, blank locales emptied. */
export function normalizeDraft(draft: ArticleDraft): ArticleDraft {
  const localizations = { ...draft.localizations };
  for (const locale of LOCALES) {
    const loc = localizations[locale];
    localizations[locale] = isBlankLocalization(loc)
      ? emptyLocalization()
      : { title: loc.title.trim(), summary: loc.summary.trim(), body_md: loc.body_md.trim() };
  }
  return { ...draft, slug: draft.slug.trim(), cover_image_url: draft.cover_image_url.trim(), localizations };
}

/**
 * Inserts `![alt](url)` into `body` at the selection, on a line of its own (the app draws an image
 * only when it stands alone on its line). Returns the new body and where the cursor goes.
 */
export function insertImageMarkdown(
  body: string,
  selectionStart: number,
  selectionEnd: number,
  alt: string,
  url: string,
): { body: string; cursor: number } {
  const before = body.slice(0, selectionStart);
  const after = body.slice(selectionEnd);
  const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after === "" || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const inserted = `${lead}${imageMarkdown(alt, url)}${trail}`;
  return { body: before + inserted + after, cursor: before.length + inserted.length };
}

// ---- Validation --------------------------------------------------------------------------------

export type DraftProblem = { locale: Locale | null; message: string };

/** What blocks Save. */
export function validateDraft(draft: ArticleDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const slug = draft.slug;
  if (slug === "") {
    problems.push({ locale: null, message: "Slug is required." });
  } else if (!ARTICLE_SLUG_PATTERN.test(slug) || slug.length > ARTICLE_SLUG_MAX) {
    problems.push({
      locale: null,
      message: `Slug uses lower-case letters, digits, - and _, starts with a letter or digit, up to ${ARTICLE_SLUG_MAX} characters.`,
    });
  }
  const cover = draft.cover_image_url.trim();
  if (cover !== "" && (!/^https:\/\/\S+$/.test(cover) || cover.length > ARTICLE_COVER_MAX)) {
    problems.push({ locale: null, message: "Cover must be an https URL without spaces (up to 2048 characters)." });
  }
  if (isBlankLocalization(draft.localizations.en)) {
    problems.push({ locale: "en", message: "en is required: the app falls back to it when a locale is missing." });
  }
  for (const locale of LOCALES) {
    const loc = draft.localizations[locale];
    if (isBlankLocalization(loc)) continue;
    if (loc.title.trim() === "") problems.push({ locale, message: `${locale}: title is required.` });
    if (loc.body_md.trim() === "") problems.push({ locale, message: `${locale}: body is required.` });
    if (loc.title.length > ARTICLE_TITLE_MAX) {
      problems.push({ locale, message: `${locale}: title must be at most ${ARTICLE_TITLE_MAX} characters.` });
    }
    if (loc.summary.length > ARTICLE_SUMMARY_MAX) {
      problems.push({ locale, message: `${locale}: summary must be at most ${ARTICLE_SUMMARY_MAX} characters.` });
    }
    if (loc.body_md.length > ARTICLE_BODY_MAX) {
      problems.push({ locale, message: `${locale}: body must be at most ${ARTICLE_BODY_MAX} characters.` });
    }
  }
  return problems;
}

export type DraftWarning = { locale: Locale | null; message: string };

/** Body length above which a "short review" is no longer short. */
export const LONG_BODY_CHARS = 3000;

const SOURCE_PATTERN = /(\bdoi\b|10\.\d{4,9}\/\S+|https?:\/\/)/i;

/** True when `body` cites a source: a DOI, a doi.org link or any link. */
export function citesSource(body: string): boolean {
  return SOURCE_PATTERN.test(body);
}

/** Non-blocking: missing non-en locales and editorial slips. */
export function draftWarnings(draft: ArticleDraft): DraftWarning[] {
  const warnings: DraftWarning[] = [];
  for (const locale of LOCALES) {
    if (locale !== "en" && isBlankLocalization(draft.localizations[locale])) {
      warnings.push({ locale, message: `No ${locale} text: ${locale} users will read the en version.` });
    }
  }
  for (const locale of presentLocales(draft)) {
    const loc = draft.localizations[locale];
    if (draft.kind === "science_brief" && loc.body_md.trim() !== "" && !citesSource(loc.body_md)) {
      warnings.push({ locale, message: `${locale}: a science brief needs its source. Add the DOI or a link to the study.` });
    }
    if (loc.body_md.length > LONG_BODY_CHARS) {
      warnings.push({ locale, message: `${locale}: ${loc.body_md.length} characters is long for a short review. Trim it if you can.` });
    }
  }
  return warnings;
}

/** The editorial guidance shown next to the editor. */
export function editorialHint(kind: ArticleKind): string[] {
  const common = [
    "Short review tone: say what changed or what the study found in a few lines, no hype.",
    "End with one practical takeaway the reader can use in their training.",
  ];
  return kind === "science_brief"
    ? [...common, "Name the source at the end: authors, year and the DOI (or a link). Readers can check it."]
    : [...common, "Write for the people using the app: what is new, where to find it, why it helps."];
}

// ---- Status ------------------------------------------------------------------------------------

export function articleStatus(
  article: { active: boolean; published_at: string | null },
  now: number = Date.now(),
): ArticleStatus {
  if (!article.active) return "retired";
  if (article.published_at === null) return "draft";
  return Date.parse(article.published_at) > now ? "scheduled" : "published";
}

/** `YYYY-MM-DDTHH:mm` in the browser's time zone, for `<input type="datetime-local">`. */
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The ISO timestamp of a `datetime-local` value, or null when it is empty or invalid. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ---- Save plan ---------------------------------------------------------------------------------

export type ArticleMetaPatch = {
  slug?: string;
  kind?: ArticleKind;
  active?: boolean;
  published_at?: string | null;
  cover_image_url?: string | null;
};

export type SavePlan = {
  meta: ArticleMetaPatch | null;
  /** Locales to write (insert or update). */
  upserts: Locale[];
  /** Locales to delete; never `en`. */
  deletes: Locale[];
};

/** What Save has to write to turn `base` (the saved article) into `draft`. */
export function planSave(base: ArticleDraft, draft: ArticleDraft): SavePlan {
  const meta: ArticleMetaPatch = {};
  if (base.slug !== draft.slug) meta.slug = draft.slug;
  if (base.kind !== draft.kind) meta.kind = draft.kind;
  if (base.active !== draft.active) meta.active = draft.active;
  if (base.published_at !== draft.published_at) meta.published_at = draft.published_at;
  if (base.cover_image_url !== draft.cover_image_url) meta.cover_image_url = draft.cover_image_url.trim() || null;

  const upserts: Locale[] = [];
  const deletes: Locale[] = [];
  for (const locale of changedLocales(base, draft)) {
    if (isBlankLocalization(draft.localizations[locale])) {
      if (locale !== "en" && !isBlankLocalization(base.localizations[locale])) deletes.push(locale);
    } else {
      upserts.push(locale);
    }
  }
  return { meta: Object.keys(meta).length > 0 ? meta : null, upserts, deletes };
}

/** The localization rows to send for a locale (summary empty = null). */
export function localizationInput(draft: ArticleDraft, locale: Locale) {
  const loc = draft.localizations[locale];
  return { locale, title: loc.title.trim(), summary: loc.summary.trim() || null, body_md: loc.body_md.trim() };
}

/** The metadata of a new article. */
export function metaInput(draft: ArticleDraft) {
  return {
    slug: draft.slug,
    kind: draft.kind,
    active: draft.active,
    published_at: draft.published_at,
    cover_image_url: draft.cover_image_url.trim() || null,
  };
}

/** Articles whose cover or body embeds `url`, by slug. */
export function articlesReferencing(
  articles: readonly Pick<Article, "slug" | "cover_image_url" | "localizations">[],
  url: string,
): string[] {
  return articles
    .filter((a) => a.cover_image_url === url || a.localizations.some((loc) => loc.body_md.includes(url)))
    .map((a) => a.slug);
}
