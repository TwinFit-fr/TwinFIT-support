import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { friendlyCatalogError } from "./guard-rails.ts";
import { searchSynonymActionSchema } from "./search-synonym-schemas.ts";
import {
  groupSearchSynonyms,
  normalizeSearchPhrase,
  parseSearchPhrase,
  parseSearchSynonymCode,
  planSearchSynonymAdd,
  synonymGroupMatches,
} from "./search-synonyms.ts";

describe("normalizeSearchPhrase", () => {
  it("folds like the search: lower case, accents, sharp s, punctuation as one space", () => {
    assert.equal(normalizeSearchPhrase("  Élévation   Latérale "), "elevation laterale");
    assert.equal(normalizeSearchPhrase("Pull-Up"), "pull up");
    assert.equal(normalizeSearchPhrase("Unterkörper"), "unterkorper");
    assert.equal(normalizeSearchPhrase("Fußball"), "fussball");
    assert.equal(normalizeSearchPhrase("tirón a la cara"), "tiron a la cara");
    assert.equal(normalizeSearchPhrase("curl (piernas), 2x"), "curl piernas 2x");
    assert.equal(normalizeSearchPhrase(null), "");
  });
  it("gives the form the database CHECK accepts, or an error", () => {
    assert.equal(parseSearchPhrase("Lower Traps"), "lower traps");
    assert.throws(() => parseSearchPhrase(" -- "), /at least one letter or digit/);
    assert.throws(() => parseSearchPhrase("a".repeat(81)), /at most 80/);
  });
});

describe("parseSearchSynonymCode", () => {
  it("wants an exo_id for an alias", () => {
    assert.equal(parseSearchSynonymCode("exercise", " 41 "), "41");
    assert.throws(() => parseSearchSynonymCode("exercise", "041"), /exo_id/);
    assert.throws(() => parseSearchSynonymCode("exercise", "QUADS"), /exo_id/);
  });
  it("wants a taxonomy code otherwise (legacy movement codes keep their space)", () => {
    assert.equal(parseSearchSynonymCode("also_muscle", "SERRATUS_ANTERIOR"), "SERRATUS_ANTERIOR");
    assert.equal(parseSearchSynonymCode("movement_type", "CALF RAISE"), "CALF RAISE");
    assert.throws(() => parseSearchSynonymCode("muscle_group", "quads"), /not a muscle_group code/);
  });
});

const rows = [
  { locale: "en", phrase: "legs", kind: "muscle_group", code: "QUADS" },
  { locale: "en", phrase: "legs", kind: "muscle_group", code: "CALVES" },
  { locale: "es", phrase: "curl de piernas", kind: "exercise", code: "169" },
  { locale: "es", phrase: "curl de piernas", kind: "exercise", code: "41" },
  { locale: "de", phrase: "beine", kind: "muscle_group", code: "QUADS" },
  { locale: "en", phrase: "lower traps", kind: "also_muscle", code: "MID_LOWER_TRAPS" },
];

describe("groupSearchSynonyms", () => {
  it("groups a phrase's codes, locales in en/es/fr/de order, exo_ids by number", () => {
    const groups = groupSearchSynonyms(rows);
    assert.deepEqual(
      groups.map((g) => `${g.locale}:${g.phrase}`),
      ["en:legs", "en:lower traps", "es:curl de piernas", "de:beine"],
    );
    assert.deepEqual(groups[0].entries.map((e) => e.code), ["CALVES", "QUADS"]);
    assert.deepEqual(groups[2].entries.map((e) => e.code), ["41", "169"]);
  });
  it("filters by phrase, code or label", () => {
    const [legs, , curl] = groupSearchSynonyms(rows);
    const label = (e: { code: string }) => (e.code === "41" ? "#41 Seated Leg Curl" : e.code);
    assert.ok(synonymGroupMatches(legs, "LEG", label));
    assert.ok(synonymGroupMatches(legs, "calves", label));
    assert.ok(synonymGroupMatches(curl, "seated", label));
    assert.ok(!synonymGroupMatches(curl, "squat", label));
    assert.ok(synonymGroupMatches(curl, "  ", label));
  });
});

describe("planSearchSynonymAdd", () => {
  it("adds one row per new code, skipping the ones already there and repeats", () => {
    const plan = planSearchSynonymAdd(
      { locale: "en", phrase: "Legs", kind: "muscle_group", codes: ["QUADS", "GLUTES", "GLUTES", " HAMSTRINGS "] },
      rows,
    );
    assert.deepEqual(plan.rows.map((r) => r.code), ["GLUTES", "HAMSTRINGS"]);
    assert.deepEqual(plan.existing.map((r) => r.code), ["QUADS"]);
    assert.ok(plan.rows.every((r) => r.phrase === "legs" && r.locale === "en"));
  });
  it("lets a phrase stand for a code of another kind (the key holds the kind)", () => {
    const plan = planSearchSynonymAdd(
      { locale: "en", phrase: "lower traps", kind: "target_muscle", codes: ["MID_LOWER_TRAPS"] },
      rows,
    );
    assert.equal(plan.rows.length, 1);
  });
  it("refuses an unknown locale or kind and an empty pick", () => {
    assert.throws(() => planSearchSynonymAdd({ locale: "it", phrase: "x", kind: "exercise", codes: ["1"] }), /locale/);
    assert.throws(() => planSearchSynonymAdd({ locale: "en", phrase: "x", kind: "grip", codes: ["1"] }), /kind/);
    assert.throws(() => planSearchSynonymAdd({ locale: "en", phrase: "x", kind: "exercise", codes: [] }), /at least one/);
  });
});

describe("searchSynonymActionSchema", () => {
  it("accepts an add with several codes and a delete by full key", () => {
    assert.ok(
      searchSynonymActionSchema.safeParse({ action: "add", locale: "fr", phrase: "Jambes", kind: "muscle_group", codes: ["QUADS", "GLUTES"] }).success,
    );
    assert.ok(
      searchSynonymActionSchema.safeParse({ action: "delete", locale: "en", phrase: "lower traps", kind: "also_muscle", code: "MID_LOWER_TRAPS" }).success,
    );
  });
  it("refuses an unknown kind, a delete of a phrase not in the search form, and no codes", () => {
    assert.ok(!searchSynonymActionSchema.safeParse({ action: "add", locale: "en", phrase: "x", kind: "grip", codes: ["A"] }).success);
    assert.ok(!searchSynonymActionSchema.safeParse({ action: "delete", locale: "en", phrase: "Legs", kind: "muscle_group", code: "QUADS" }).success);
    assert.ok(!searchSynonymActionSchema.safeParse({ action: "add", locale: "en", phrase: "x", kind: "exercise", codes: [] }).success);
  });
});

describe("friendlyCatalogError for search synonyms", () => {
  it("rewords the target check, the key and the kind check", () => {
    assert.equal(
      friendlyCatalogError("catalog.search_synonyms (en, leg curl): exercise 999 does not exist", "synonym"),
      '"leg curl" (en): exercise #999 does not exist',
    );
    assert.equal(
      friendlyCatalogError("catalog.search_synonyms (es, piernas): muscle_group FOO does not exist", "synonym"),
      '"piernas" (es): muscle_group FOO does not exist',
    );
    assert.match(
      friendlyCatalogError('Uniqueness violation. duplicate key value violates unique constraint "search_synonyms_pkey"', "synonym"),
      /already stands for that code/,
    );
    assert.match(
      friendlyCatalogError('new row for relation "search_synonyms" violates check constraint "search_synonyms_kind_check"', "synonym"),
      /also_muscle needs backend 2\.12\.0/,
    );
    assert.match(friendlyCatalogError("database query error", "synonym"), /search synonym change/);
  });
  it("points the in-use guard to the Support screen", () => {
    assert.match(
      friendlyCatalogError("catalog.muscles: SERRATUS_ANTERIOR is named by search synonyms (catalog.search_synonyms kind target_muscle / also_muscle): repoint or delete them first", "lookup"),
      /Catalog → Search synonyms/,
    );
  });
});
