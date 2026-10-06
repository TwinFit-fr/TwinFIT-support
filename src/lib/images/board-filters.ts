import type { ExerciseImageBoardItem } from "./types";

type BoardStatus = ExerciseImageBoardItem["status"];

const BOARD_STATUSES: readonly BoardStatus[] = ["empty", "partial", "complete", "inactive_only"];

/**
 * The Exercises board filters. They live in the URL, so the exercise workspace browses the same
 * filtered list and going back restores the board as it was.
 */
export type BoardFilters = {
  q: string;
  status: "all" | BoardStatus;
  /** Primary muscle group id, or "all". */
  muscle: string;
  /** Equipment id, or "all". */
  equipment: string;
};

export function readBoardFilters(params: { get(name: string): string | null }): BoardFilters {
  const status = params.get("status");
  return {
    q: params.get("q") ?? "",
    status: BOARD_STATUSES.find((s) => s === status) ?? "all",
    muscle: params.get("muscle") || "all",
    equipment: params.get("equipment") || "all",
  };
}

/** "?q=…&status=…" with only the active filters, or "" when none is set. */
export function boardFiltersQuery(filters: BoardFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.muscle !== "all") params.set("muscle", filters.muscle);
  if (filters.equipment !== "all") params.set("equipment", filters.equipment);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function matchesBoardFilters(ex: ExerciseImageBoardItem, filters: BoardFilters): boolean {
  if (filters.status !== "all" && ex.status !== filters.status) return false;
  if (filters.muscle !== "all" && ex.primary_muscle_group?.id !== filters.muscle) return false;
  if (filters.equipment !== "all" && ex.equipment?.id !== filters.equipment) return false;
  const q = filters.q.trim().toLowerCase();
  if (!q) return true;
  return ex.display_name.toLowerCase().includes(q) || String(ex.exo_id).includes(q);
}

/**
 * The filtered exercises before and after `exoId` in board order. Neighbours are looked up from
 * the exercise's place in the whole board, so they stay right after it stops matching (a
 * generation moves it out of "Empty").
 */
export function boardNeighbours(
  exercises: ExerciseImageBoardItem[],
  filters: BoardFilters,
  exoId: number,
): { previous: number | null; next: number | null } {
  const index = exercises.findIndex((ex) => ex.exo_id === exoId);
  if (index < 0) return { previous: null, next: null };
  const matching = (ex: ExerciseImageBoardItem) => matchesBoardFilters(ex, filters);
  return {
    previous: exercises.slice(0, index).findLast(matching)?.exo_id ?? null,
    next: exercises.slice(index + 1).find(matching)?.exo_id ?? null,
  };
}
