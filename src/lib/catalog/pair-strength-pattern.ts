/** Pair-level strength pattern: no override, isolation (override with no pattern) or an override pattern. */
export type PairStrengthPattern =
  | { override: false; code: null }
  | { override: true; code: string | null };

export function parsePairStrengthPattern(raw: unknown): PairStrengthPattern {
  const value = String(raw ?? "").trim();
  if (!value || value.toLowerCase() === "inherit") return { override: false, code: null };
  if (value.toLowerCase() === "none") return { override: true, code: null };
  return { override: true, code: value.toUpperCase() };
}
