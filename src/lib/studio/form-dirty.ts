/**
 * Whether a dialog's form holds work the user would lose by closing it: a field whose value is
 * not the one the form started with (or last filled in by itself). Whitespace around text,
 * "" against null and 4 against "4" are the same value, so tabbing through a field is not work.
 * Pure.
 */

export type FormValue = string | number | boolean | null | undefined;
export type FormValues = Record<string, FormValue>;

function normal(value: FormValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return value ? "true" : "false";
}

/** The fields of `current` that differ from `baseline` (a field missing from one side counts as empty). */
export function changedFields(baseline: FormValues, current: FormValues): string[] {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  return [...keys].filter((k) => normal(baseline[k]) !== normal(current[k]));
}

export function isFormDirty(baseline: FormValues, current: FormValues): boolean {
  return changedFields(baseline, current).length > 0;
}

/**
 * A form that fills itself in (another source, another subject): fields the user has not touched
 * (still equal to their baseline) take the new values and the new baseline; touched fields keep
 * what was typed, and stay dirty.
 */
export function refillUntouched<T extends FormValues>(current: T, baseline: T, next: Partial<T>): { values: T; baseline: T } {
  const values = { ...current };
  const base = { ...baseline };
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (normal(current[key]) !== normal(baseline[key])) continue;
    values[key] = next[key] as T[keyof T];
    base[key] = next[key] as T[keyof T];
  }
  return { values, baseline: base };
}
