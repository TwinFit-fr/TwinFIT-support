import { normalizeMuscleCode, normalizeTaxonomy } from "./normalize.ts";

export type LookupRef = { id: string; code: string };

/** Runs the find document of a lookup table with `{ code }` and returns its data. */
export type LookupFinder = (code: string) => Promise<Record<string, LookupRef[] | undefined>>;

/** Muscle codes are SCREAMING_SNAKE; every other table uses the upper-cased trimmed code. */
export function lookupCode(table: string, code: unknown): string {
  return table === "catalog_muscles" ? normalizeMuscleCode(code) : normalizeTaxonomy(code);
}

/** Looks a row up by code; null when the code does not exist. Never writes. */
export async function findLookupRow(
  find: LookupFinder,
  table: string,
  code: unknown,
): Promise<LookupRef | null> {
  const c = lookupCode(table, code);
  if (!c) throw new Error(`Empty code for ${table}`);
  const data = await find(c);
  return data[table]?.[0] ?? null;
}

/**
 * Looks a row up by code and fails when it does not exist: exercises and relations only point
 * at values that already exist. New values are created from the Taxonomy panel (`upsertLookup`).
 */
export async function requireLookupRow(
  find: LookupFinder,
  table: string,
  code: unknown,
): Promise<LookupRef> {
  const hit = await findLookupRow(find, table, code);
  if (!hit) {
    throw new Error(
      `Unknown ${table.replace("catalog_", "")} code: ${lookupCode(table, code)}. Create it in Taxonomy first.`,
    );
  }
  return hit;
}
