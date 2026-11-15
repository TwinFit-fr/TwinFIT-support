import type { Locale } from "../coach/types.ts";

/** `assistant.articles.kind` (DATABASE_CONTRACT, migration 1790000000089). */
export const ARTICLE_KINDS = ["app_update", "science_brief"] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number];

export const ARTICLE_KIND_LABELS: Record<ArticleKind, string> = {
  app_update: "App update",
  science_brief: "Science brief",
};

/** Column limits of `assistant.articles` and `assistant.article_localizations`. */
export const ARTICLE_SLUG_MAX = 80;
export const ARTICLE_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
export const ARTICLE_COVER_MAX = 2048;
export const ARTICLE_TITLE_MAX = 120;
export const ARTICLE_SUMMARY_MAX = 300;
/** Same cap as `suggestion_localizations.answer_md`. */
export const ARTICLE_BODY_MAX = 16000;

export type ArticleLocalization = {
  article_id: string;
  locale: Locale;
  title: string;
  summary: string | null;
  body_md: string;
  created_at: string;
  updated_at: string;
};

export type Article = {
  id: string;
  slug: string;
  kind: ArticleKind;
  active: boolean;
  /** null = draft; a future time = scheduled. */
  published_at: string | null;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
  /** Computed field: active and published_at <= now(). */
  is_published: boolean;
  localizations: ArticleLocalization[];
};

export type ArticleStatus = "draft" | "scheduled" | "published" | "retired";
