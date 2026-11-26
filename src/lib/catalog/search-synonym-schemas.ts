import { z } from "zod";
import { SEARCH_SYNONYM_KINDS, SEARCH_SYNONYM_LOCALES } from "./search-synonyms.ts";

/**
 * Body of `POST /api/catalog/search-synonyms`. Shapes and sizes only: the phrase is normalized
 * and the codes checked by `planSearchSynonymAdd`, and the database checks that each code exists.
 */
const locale = z.enum(SEARCH_SYNONYM_LOCALES, { error: "locale must be en|es|fr|de" });
const kind = z.enum(SEARCH_SYNONYM_KINDS, { error: "unknown synonym kind" });
const code = z.string().trim().min(1).max(100);

export const searchSynonymActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    locale,
    /** As typed: the server stores it in the search form. */
    phrase: z.string().max(300),
    kind,
    codes: z.array(code).min(1, { error: "pick at least one code" }).max(300),
  }),
  z.object({
    action: z.literal("delete"),
    locale,
    /** As stored (already in the search form). */
    phrase: z.string().regex(/^[a-z0-9]+( [a-z0-9]+)*$/, { error: "phrase is not in the search form" }).max(300),
    kind,
    code,
  }),
]);

export type SearchSynonymAction = z.infer<typeof searchSynonymActionSchema>;
