/**
 * The GraphQL operations of the Support articles editor (`assistant.articles` and
 * `assistant.article_localizations`), sent with the staff JWT. Every document is a fixed, named
 * operation: variables carry the data, nothing is built from strings at run time, so the Hasura
 * allow-list can list each one as it stands here. Every document is written with the
 * `gql` tag (no interpolation), so `scripts/graphql-manifest.mjs` lists it.
 */

import { gql } from "../gql.ts";

export const SUPPORT_ARTICLES_QUERY = gql`query SupportArticles {
  assistant_articles(order_by: [{ published_at: desc_nulls_first }, { created_at: desc }]) {
    id slug kind active published_at cover_image_url created_at updated_at is_published
    localizations(order_by: { locale: asc }) { article_id locale title summary body_md created_at updated_at }
  }
}`;

export const SUPPORT_ARTICLE_INSERT_MUTATION = gql`mutation SupportArticleInsert($object: assistant_articles_insert_input!) {
  insert_assistant_articles_one(object: $object) {
    id slug kind active published_at cover_image_url created_at updated_at is_published
    localizations(order_by: { locale: asc }) { article_id locale title summary body_md created_at updated_at }
  }
}`;

export const SUPPORT_ARTICLE_UPDATE_MUTATION = gql`mutation SupportArticleUpdate($id: uuid!, $set: assistant_articles_set_input!) {
  update_assistant_articles_by_pk(pk_columns: { id: $id }, _set: $set) {
    id slug kind active published_at cover_image_url created_at updated_at is_published
    localizations(order_by: { locale: asc }) { article_id locale title summary body_md created_at updated_at }
  }
}`;

export const SUPPORT_ARTICLE_DELETE_MUTATION = gql`mutation SupportArticleDelete($id: uuid!) {
  delete_assistant_articles_by_pk(id: $id) { id }
}`;

export const SUPPORT_ARTICLE_LOCALIZATION_UPSERT_MUTATION = gql`mutation SupportArticleLocalizationUpsert($object: assistant_article_localizations_insert_input!) {
  insert_assistant_article_localizations_one(
    object: $object
    on_conflict: { constraint: article_localizations_pkey, update_columns: [title, summary, body_md] }
  ) { article_id locale }
}`;

export const SUPPORT_ARTICLE_LOCALIZATION_DELETE_MUTATION = gql`mutation SupportArticleLocalizationDelete($article_id: uuid!, $locale: String!) {
  delete_assistant_article_localizations_by_pk(article_id: $article_id, locale: $locale) { article_id }
}`;

/** Every operation of this module by name, for the allow-list manifest. */
export const ARTICLE_OPERATIONS: Record<string, string> = {
  SupportArticles: SUPPORT_ARTICLES_QUERY,
  SupportArticleInsert: SUPPORT_ARTICLE_INSERT_MUTATION,
  SupportArticleUpdate: SUPPORT_ARTICLE_UPDATE_MUTATION,
  SupportArticleDelete: SUPPORT_ARTICLE_DELETE_MUTATION,
  SupportArticleLocalizationUpsert: SUPPORT_ARTICLE_LOCALIZATION_UPSERT_MUTATION,
  SupportArticleLocalizationDelete: SUPPORT_ARTICLE_LOCALIZATION_DELETE_MUTATION,
};
