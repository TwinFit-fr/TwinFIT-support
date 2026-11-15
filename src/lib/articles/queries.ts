import { staffGql } from "@/lib/staff-gql";
import {
  SUPPORT_ARTICLES_QUERY,
  SUPPORT_ARTICLE_DELETE_MUTATION,
  SUPPORT_ARTICLE_INSERT_MUTATION,
  SUPPORT_ARTICLE_LOCALIZATION_DELETE_MUTATION,
  SUPPORT_ARTICLE_LOCALIZATION_UPSERT_MUTATION,
  SUPPORT_ARTICLE_UPDATE_MUTATION,
} from "./operations";
import type { Article, ArticleKind } from "./types";

export type ArticleMetaInput = {
  slug: string;
  kind: ArticleKind;
  active: boolean;
  published_at: string | null;
  cover_image_url: string | null;
};

export type ArticleLocalizationInput = {
  locale: string;
  title: string;
  summary: string | null;
  body_md: string;
};

export async function listArticles(token: string): Promise<Article[]> {
  const data = await staffGql<{ assistant_articles: Article[] }>(token, SUPPORT_ARTICLES_QUERY);
  return data.assistant_articles ?? [];
}

/** Creates the article with its localizations in one mutation: the `en` row must be among them. */
export async function createArticle(
  token: string,
  meta: ArticleMetaInput,
  localizations: ArticleLocalizationInput[],
): Promise<Article> {
  const data = await staffGql<{ insert_assistant_articles_one: Article }>(
    token,
    SUPPORT_ARTICLE_INSERT_MUTATION,
    { object: { ...meta, localizations: { data: localizations } } },
  );
  return data.insert_assistant_articles_one;
}

export async function updateArticle(
  token: string,
  id: string,
  patch: Partial<ArticleMetaInput>,
): Promise<Article> {
  const data = await staffGql<{ update_assistant_articles_by_pk: Article | null }>(
    token,
    SUPPORT_ARTICLE_UPDATE_MUTATION,
    { id, set: patch },
  );
  if (!data.update_assistant_articles_by_pk) throw new Error("Article not found");
  return data.update_assistant_articles_by_pk;
}

export async function deleteArticle(token: string, id: string): Promise<void> {
  await staffGql(token, SUPPORT_ARTICLE_DELETE_MUTATION, { id });
}

export async function upsertArticleLocalization(
  token: string,
  articleId: string,
  input: ArticleLocalizationInput,
): Promise<void> {
  await staffGql(token, SUPPORT_ARTICLE_LOCALIZATION_UPSERT_MUTATION, {
    object: { article_id: articleId, ...input },
  });
}

export async function deleteArticleLocalization(
  token: string,
  articleId: string,
  locale: string,
): Promise<void> {
  await staffGql(token, SUPPORT_ARTICLE_LOCALIZATION_DELETE_MUTATION, {
    article_id: articleId,
    locale,
  });
}
