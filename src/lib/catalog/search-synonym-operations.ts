import { gql } from "@/lib/gql";
import { staffGql } from "@/lib/staff-gql";
import {
  parseSearchPhrase,
  planSearchSynonymAdd,
  type SearchSynonymKind,
  type SearchSynonymLocale,
  type SearchSynonymRow,
  type SearchSynonymsData,
} from "./search-synonyms";

type Lookup = { code: string; name: string; active: boolean };

/** Every synonym and every code they may name (inactive ones too, to label existing rows). */
export async function fetchSearchSynonyms(token: string): Promise<SearchSynonymsData> {
  const data = await staffGql<{
    catalog_search_synonyms: SearchSynonymRow[];
    catalog_exercises: Array<{ exo_id: number; display_name: string; active: boolean }>;
    catalog_muscle_groups: Lookup[];
    catalog_muscles: Lookup[];
    catalog_equipment: Lookup[];
    catalog_support_equipment: Lookup[];
    catalog_movement_types: Lookup[];
    catalog_load_modalities: Lookup[];
  }>(
    token,
    gql`query SupportCatalogSearchSynonyms {
      catalog_search_synonyms(order_by: [{ locale: asc }, { phrase: asc }, { kind: asc }, { code: asc }]) {
        locale phrase kind code
      }
      catalog_exercises(order_by: { exo_id: asc }) { exo_id display_name active }
      catalog_muscle_groups(order_by: { code: asc }) { code name active }
      catalog_muscles(order_by: { code: asc }) { code name active }
      catalog_equipment(order_by: { code: asc }) { code name active }
      catalog_support_equipment(order_by: { code: asc }) { code name active }
      catalog_movement_types(order_by: { code: asc }) { code name active }
      catalog_load_modalities(order_by: { code: asc }) { code name active }
    }`,
  );
  return {
    synonyms: data.catalog_search_synonyms,
    options: {
      exercises: data.catalog_exercises.map((e) => ({
        code: String(e.exo_id),
        name: e.display_name,
        active: e.active,
      })),
      muscle_groups: data.catalog_muscle_groups,
      muscles: data.catalog_muscles,
      equipment: data.catalog_equipment,
      support_equipment: data.catalog_support_equipment,
      movement_types: data.catalog_movement_types,
      load_modalities: data.catalog_load_modalities,
    },
  };
}

const LIST_KEYS = gql`query SupportCatalogSearchSynonymKeys($locale: String!, $phrase: String!, $kind: String!) {
  catalog_search_synonyms(where: { locale: { _eq: $locale }, phrase: { _eq: $phrase }, kind: { _eq: $kind } }) {
    locale phrase kind code
  }
}`;

/**
 * Adds a phrase for one or more codes of one kind, in one transaction. Codes the phrase already
 * stands for are skipped and returned as `existing`; the database checks that every code exists.
 */
export async function addSearchSynonyms(
  token: string,
  input: { locale: SearchSynonymLocale; phrase: string; kind: SearchSynonymKind; codes: string[] },
): Promise<{ added: SearchSynonymRow[]; existing: SearchSynonymRow[] }> {
  const current = await staffGql<{ catalog_search_synonyms: SearchSynonymRow[] }>(token, LIST_KEYS, {
    locale: input.locale,
    phrase: parseSearchPhrase(input.phrase),
    kind: input.kind,
  });
  const { rows, existing } = planSearchSynonymAdd(input, current.catalog_search_synonyms);
  if (!rows.length) return { added: [], existing };
  const result = await staffGql<{ insert_catalog_search_synonyms: { returning: SearchSynonymRow[] } }>(
    token,
    gql`mutation SupportCatalogInsertSearchSynonyms($rows: [catalog_search_synonyms_insert_input!]!) {
      insert_catalog_search_synonyms(objects: $rows) { returning { locale phrase kind code } }
    }`,
    { rows },
  );
  return { added: result.insert_catalog_search_synonyms.returning, existing };
}

/** Deletes one row by its full key (locale, phrase, kind, code). */
export async function deleteSearchSynonym(token: string, row: SearchSynonymRow): Promise<number> {
  const result = await staffGql<{ delete_catalog_search_synonyms: { affected_rows: number } }>(
    token,
    gql`mutation SupportCatalogDeleteSearchSynonym($locale: String!, $phrase: String!, $kind: String!, $code: String!) {
      delete_catalog_search_synonyms(
        where: { locale: { _eq: $locale }, phrase: { _eq: $phrase }, kind: { _eq: $kind }, code: { _eq: $code } }
      ) { affected_rows }
    }`,
    { locale: row.locale, phrase: row.phrase, kind: row.kind, code: row.code },
  );
  return result.delete_catalog_search_synonyms.affected_rows;
}
