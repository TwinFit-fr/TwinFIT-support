/**
 * Pure logic of the catalog panel: what state an exercise is in, what a search finds, how the
 * status and muscle-group filters combine, how the choice is remembered, and where an arrow key
 * moves focus. No React, no DOM: the panel only renders what these return.
 */
import type { StudioExercise } from "./types";

export type ExerciseState = "todo" | "queued" | "ready" | "failed";
export type StatusFilter = "all" | "todo" | "ready" | "attention";
export type CatalogFilter = { status: StatusFilter; group: string | null };

export const DEFAULT_FILTER: CatalogFilter = { status: "all", group: null };
export const FILTER_STORAGE_KEY = "twinfit.studio.catalog-filter.v1";

type CatalogItem = Pick<StudioExercise, "exo_id" | "display_name" | "group" | "equipment" | "target_muscle" | "vectors">;

/** The state of one exercise from its clips: ready beats in queue beats failed beats nothing. */
export function exerciseState(vectors: StudioExercise["vectors"]): ExerciseState {
  if (vectors.ready > 0) return "ready";
  if (vectors.queued > 0) return "queued";
  if (vectors.failed > 0) return "failed";
  return "todo";
}

/** Does an exercise in this state belong under this status filter? */
export function stateMatches(state: ExerciseState, status: StatusFilter): boolean {
  if (status === "all") return true;
  if (status === "todo") return state === "todo";
  if (status === "ready") return state === "ready";
  return state === "failed";
}

export type StateCounts = Record<ExerciseState, number> & { total: number };

export function countStates(exercises: readonly Pick<StudioExercise, "vectors">[]): StateCounts {
  const counts: StateCounts = { todo: 0, queued: 0, ready: 0, failed: 0, total: exercises.length };
  for (const e of exercises) counts[exerciseState(e.vectors)] += 1;
  return counts;
}

/** Lower case, accents folded, so "Pecho" and "péctoral" meet what the staff types. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** The words a search is made of (folded, split on whitespace). */
export function queryWords(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

function searchText(e: CatalogItem): string {
  return fold([e.display_name, e.group?.name, e.equipment?.name, e.target_muscle?.name].filter(Boolean).join(" "));
}

/** Edit distance between two short words (insert, delete, replace, swap of neighbours), capped. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push([i]);
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) rows[i][j] = j;
      else {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let d = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2][j - 2] + 1);
        rows[i][j] = d;
      }
    }
  }
  return rows[a.length][b.length];
}

/** A typed word is close to a name token when it is one slip away (two for long words). */
export function closeTo(word: string, token: string): boolean {
  if (word.length < 4 || /\d/.test(word)) return false;
  const allowed = word.length >= 6 ? 2 : 1;
  return editDistance(word, token, allowed) <= allowed || editDistance(word, token.slice(0, word.length), 1) <= 1;
}

/**
 * Every word must match. "#12" is that exercise's number and nothing else; a bare "12" is that
 * number or any name, muscle or equipment containing it. With `fuzzy`, a misspelt word ("dumbel")
 * also matches the name tokens it is close to.
 */
export function matchesQuery(e: CatalogItem, words: readonly string[], fuzzy = false): boolean {
  if (!words.length) return true;
  const text = searchText(e);
  const id = String(e.exo_id);
  let tokens: string[] | null = null;
  return words.every((word) => {
    if (word.startsWith("#")) return word.length > 1 && word.slice(1) === id;
    if (word === id || text.includes(word)) return true;
    if (!fuzzy) return false;
    tokens ??= text.split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.some((t) => closeTo(word, t));
  });
}

/** The exercises the filter and search leave; when nothing matches exactly, close spellings are tried. */
export function filterExercises<T extends CatalogItem>(exercises: readonly T[], filter: CatalogFilter, words: readonly string[]): T[] {
  const pick = (fuzzy: boolean) =>
    exercises.filter(
      (e) => (!filter.group || e.group?.code === filter.group) && stateMatches(exerciseState(e.vectors), filter.status) && matchesQuery(e, words, fuzzy),
    );
  const exact = pick(false);
  return exact.length || !words.length ? exact : pick(true);
}

export function isFiltered(filter: CatalogFilter, query: string): boolean {
  return filter.status !== "all" || filter.group !== null || query.trim() !== "";
}

const STATUSES: readonly StatusFilter[] = ["all", "todo", "ready", "attention"];

export function serializeFilter(filter: CatalogFilter): string {
  return JSON.stringify(filter);
}

/** What was remembered, or the default when it is missing or not ours. */
export function parseFilter(raw: string | null | undefined): CatalogFilter {
  if (!raw) return DEFAULT_FILTER;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return DEFAULT_FILTER;
    const { status, group } = value as Record<string, unknown>;
    return {
      status: STATUSES.includes(status as StatusFilter) ? (status as StatusFilter) : "all",
      group: typeof group === "string" && group ? group : null,
    };
  } catch {
    return DEFAULT_FILTER;
  }
}

/** The row an arrow, Home, End or Page key moves to (null: not a navigation key or empty list). */
export function nextRowIndex(key: string, current: number, count: number, page = 8): number | null {
  if (count <= 0) return null;
  const from = current < 0 ? 0 : current;
  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : Math.min(count - 1, from + 1);
    case "ArrowUp":
      return Math.max(0, from - 1);
    case "PageDown":
      return Math.min(count - 1, from + page);
    case "PageUp":
      return Math.max(0, from - page);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
