/**
 * Catalog search synonyms (`catalog.search_synonyms`, backend 2.12.0, migration
 * 1790000000125): words people type for a catalog filter or an exercise, per locale. One row per
 * (locale, phrase, kind, code), so a phrase may stand for several codes ("legs" = five muscle
 * groups) or be an alias of several exercises. Pure functions: the editor and the API route
 * share them; the database stays the authority (phrase CHECK, `search_synonym_target_exists`).
 */

/** Locales the table admits (CHECK locale). German rows exist for the app's search. */
export const SEARCH_SYNONYM_LOCALES = ["en", "es", "fr", "de"] as const;
export type SearchSynonymLocale = (typeof SEARCH_SYNONYM_LOCALES)[number];

export const SEARCH_SYNONYM_KINDS = [
  "exercise",
  "muscle_group",
  "target_muscle",
  "also_muscle",
  "equipment",
  "support_equipment",
  "movement_type",
  "load_modality",
] as const;
export type SearchSynonymKind = (typeof SEARCH_SYNONYM_KINDS)[number];

/** Where a kind's code comes from (`catalog.search_synonym_target_exists`). */
export type SearchSynonymSource =
  | "exercises"
  | "muscle_groups"
  | "muscles"
  | "equipment"
  | "support_equipment"
  | "movement_types"
  | "load_modalities";

export const SEARCH_SYNONYM_KIND_INFO: Record<
  SearchSynonymKind,
  { label: string; source: SearchSynonymSource; hint: string }
> = {
  exercise: {
    label: "Exercise alias",
    source: "exercises",
    hint: "Another name of the exercise (code = exo_id). The app and the Coach find the exercise by it, in any locale.",
  },
  muscle_group: {
    label: "Muscle group",
    source: "muscle_groups",
    hint: "Exercises whose primary group is this one.",
  },
  target_muscle: {
    label: "Target muscle",
    source: "muscles",
    hint: "Exercises that target this muscle.",
  },
  also_muscle: {
    label: "Muscle (target or assisting)",
    source: "muscles",
    hint: "Exercises that train this muscle as target or as an assisting muscle: for muscles few or no exercises target (serratus, rhomboids, lower traps).",
  },
  equipment: { label: "Equipment", source: "equipment", hint: "Exercises with this equipment." },
  support_equipment: {
    label: "Support equipment",
    source: "support_equipment",
    hint: "Exercises with this support (bench, rack…).",
  },
  movement_type: {
    label: "Movement",
    source: "movement_types",
    hint: "Exercises of this movement type.",
  },
  load_modality: {
    label: "Load modality",
    source: "load_modalities",
    hint: "Exercises with this load modality.",
  },
};

export type SearchSynonymRow = {
  locale: string;
  phrase: string;
  kind: string;
  code: string;
};

/** A code a synonym can name, for the editor's pickers and labels. */
export type SearchSynonymOption = { code: string; name: string; active: boolean };

export type SearchSynonymsData = {
  synonyms: SearchSynonymRow[];
  options: {
    exercises: SearchSynonymOption[];
    muscle_groups: SearchSynonymOption[];
    muscles: SearchSynonymOption[];
    equipment: SearchSynonymOption[];
    support_equipment: SearchSynonymOption[];
    movement_types: SearchSynonymOption[];
    load_modalities: SearchSynonymOption[];
  };
};

export function isSearchSynonymLocale(value: string): value is SearchSynonymLocale {
  return (SEARCH_SYNONYM_LOCALES as readonly string[]).includes(value);
}

export function isSearchSynonymKind(value: string): value is SearchSynonymKind {
  return (SEARCH_SYNONYM_KINDS as readonly string[]).includes(value);
}

/** CHECK search_synonyms_phrase_check (1790000000061). */
const PHRASE_FORMAT = /^[a-z0-9]+( [a-z0-9]+)*$/;
/** CHECK search_synonyms_exercise_code_check (1790000000101). */
const EXO_ID_FORMAT = /^[1-9][0-9]{0,8}$/;
/** Longer than any name in the catalog; keeps a pasted paragraph out of the table. */
export const SEARCH_PHRASE_MAX_LENGTH = 80;

/**
 * A phrase as the search compares it: lower case, accents folded, sharp s as ss, anything other
 * than a letter or a digit as one space (the folding of the Coach search and of migrations 118 /
 * 119). "Élévation latérale" → "elevation laterale", "Pull-Up" → "pull up".
 */
export function normalizeSearchPhrase(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The phrase to store, or an error written for staff. */
export function parseSearchPhrase(raw: unknown): string {
  const phrase = normalizeSearchPhrase(raw);
  if (!phrase) throw new Error("A phrase needs at least one letter or digit");
  if (phrase.length > SEARCH_PHRASE_MAX_LENGTH) {
    throw new Error(`A phrase is at most ${SEARCH_PHRASE_MAX_LENGTH} characters`);
  }
  if (!PHRASE_FORMAT.test(phrase)) throw new Error(`Phrase "${phrase}" is not in the search form`);
  return phrase;
}

/** A code as the table stores it: an exo_id for an alias, an upper-case taxonomy code otherwise. */
export function parseSearchSynonymCode(kind: SearchSynonymKind, raw: unknown): string {
  const code = String(raw ?? "").trim();
  if (kind === "exercise") {
    if (!EXO_ID_FORMAT.test(code)) throw new Error(`Exercise alias code "${code}" must be an exo_id`);
    return code;
  }
  if (!/^[A-Z0-9][A-Z0-9_ -]*$/.test(code)) throw new Error(`Code "${code}" is not a ${kind} code`);
  return code;
}

export type SearchSynonymEntry = { kind: string; code: string };

/** One phrase of one locale with everything it stands for. */
export type SearchSynonymGroup = {
  key: string;
  locale: string;
  phrase: string;
  entries: SearchSynonymEntry[];
};

export const synonymGroupKey = (locale: string, phrase: string) => `${locale}\u0000${phrase}`;
export const synonymRowKey = (row: SearchSynonymRow) =>
  `${row.locale}\u0000${row.phrase}\u0000${row.kind}\u0000${row.code}`;

/** Rows grouped by (locale, phrase), sorted by locale order then phrase; entries by kind then code. */
export function groupSearchSynonyms(rows: readonly SearchSynonymRow[]): SearchSynonymGroup[] {
  const groups = new Map<string, SearchSynonymGroup>();
  for (const row of rows) {
    const key = synonymGroupKey(row.locale, row.phrase);
    let group = groups.get(key);
    if (!group) {
      group = { key, locale: row.locale, phrase: row.phrase, entries: [] };
      groups.set(key, group);
    }
    group.entries.push({ kind: row.kind, code: row.code });
  }
  const kindOrder = (kind: string) => {
    const i = (SEARCH_SYNONYM_KINDS as readonly string[]).indexOf(kind);
    return i < 0 ? SEARCH_SYNONYM_KINDS.length : i;
  };
  const localeOrder = (locale: string) => {
    const i = (SEARCH_SYNONYM_LOCALES as readonly string[]).indexOf(locale);
    return i < 0 ? SEARCH_SYNONYM_LOCALES.length : i;
  };
  const byCode = (a: string, b: string) =>
    /^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : a.localeCompare(b);
  return [...groups.values()]
    .map((g) => ({
      ...g,
      entries: g.entries.sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || byCode(a.code, b.code)),
    }))
    .sort((a, b) => localeOrder(a.locale) - localeOrder(b.locale) || a.phrase.localeCompare(b.phrase));
}

/**
 * The rows an add would insert: the phrase normalized, codes trimmed and deduplicated, and the
 * ones already in the table split out (`existing`), so a repeat is said instead of refused.
 */
export function planSearchSynonymAdd(
  input: { locale: string; phrase: unknown; kind: string; codes: readonly unknown[] },
  current: readonly SearchSynonymRow[] = [],
): { rows: SearchSynonymRow[]; existing: SearchSynonymRow[] } {
  if (!isSearchSynonymLocale(input.locale)) throw new Error(`Unknown locale "${input.locale}"`);
  if (!isSearchSynonymKind(input.kind)) throw new Error(`Unknown kind "${input.kind}"`);
  const kind = input.kind;
  const phrase = parseSearchPhrase(input.phrase);
  const codes = [...new Set(input.codes.map((c) => parseSearchSynonymCode(kind, c)))];
  if (!codes.length) throw new Error("Pick at least one code");
  const taken = new Set(current.map(synonymRowKey));
  const rows: SearchSynonymRow[] = [];
  const existing: SearchSynonymRow[] = [];
  for (const code of codes) {
    const row = { locale: input.locale, phrase, kind, code };
    (taken.has(synonymRowKey(row)) ? existing : rows).push(row);
  }
  return { rows, existing };
}

/** Free-text filter of the list: phrase, code or the code's label, folded like the search. */
export function synonymGroupMatches(
  group: SearchSynonymGroup,
  query: string,
  labelOf: (entry: SearchSynonymEntry) => string,
): boolean {
  const q = normalizeSearchPhrase(query);
  if (!q) return true;
  if (group.phrase.includes(q)) return true;
  return group.entries.some(
    (e) => normalizeSearchPhrase(e.code).includes(q) || normalizeSearchPhrase(labelOf(e)).includes(q),
  );
}
