import type { ExerciseImageBoardItem, MuscleMapBoardTarget, MuscleMapTargetRef } from "./types";

type BoardStatus = ExerciseImageBoardItem["status"];
type SearchParamsLike = { get(name: string): string | null };

const BOARD_STATUSES: readonly BoardStatus[] = ["empty", "partial", "complete", "inactive_only"];

/**
 * Board filters live in the URL, so a workspace browses the same filtered list as its board and
 * going back restores the board as it was. Exercises filter by text, status, muscle group and
 * equipment; Muscle maps by text and status.
 */
export type BoardFilters = {
  q: string;
  status: "all" | BoardStatus;
  /** Primary muscle group id, or "all". */
  muscle: string;
  /** Equipment id, or "all". */
  equipment: string;
};

export type MapBoardFilters = Pick<BoardFilters, "q" | "status">;

function readStatus(params: SearchParamsLike): BoardFilters["status"] {
  const status = params.get("status");
  return BOARD_STATUSES.find((s) => s === status) ?? "all";
}

/** "?q=…&status=…" with only the set values ("" and "all" are unset), or "" when none is. */
function toQuery(values: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value && value !== "all") params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function matchesText(q: string, ...fields: string[]): boolean {
  const query = q.trim().toLowerCase();
  return !query || fields.some((field) => field.toLowerCase().includes(query));
}

/**
 * The matching items before and after `index`. Neighbours are looked up from the item's place in
 * the whole list, so they stay right after it stops matching (a generation moves it out of
 * "Empty").
 */
function neighboursAt<T>(items: T[], index: number, matches: (item: T) => boolean) {
  if (index < 0) return { previous: null, next: null };
  return {
    previous: items.slice(0, index).findLast(matches) ?? null,
    next: items.slice(index + 1).find(matches) ?? null,
  };
}

export function readBoardFilters(params: SearchParamsLike): BoardFilters {
  return {
    q: params.get("q") ?? "",
    status: readStatus(params),
    muscle: params.get("muscle") || "all",
    equipment: params.get("equipment") || "all",
  };
}

export function boardFiltersQuery(filters: BoardFilters): string {
  return toQuery(filters);
}

export function matchesBoardFilters(ex: ExerciseImageBoardItem, filters: BoardFilters): boolean {
  if (filters.status !== "all" && ex.status !== filters.status) return false;
  if (filters.muscle !== "all" && ex.primary_muscle_group?.id !== filters.muscle) return false;
  if (filters.equipment !== "all" && ex.equipment?.id !== filters.equipment) return false;
  return matchesText(filters.q, ex.display_name, String(ex.exo_id));
}

/** The filtered exercises before and after `exoId` in board order. */
export function boardNeighbours(
  exercises: ExerciseImageBoardItem[],
  filters: BoardFilters,
  exoId: number,
): { previous: number | null; next: number | null } {
  const { previous, next } = neighboursAt(
    exercises,
    exercises.findIndex((ex) => ex.exo_id === exoId),
    (ex) => matchesBoardFilters(ex, filters),
  );
  return { previous: previous?.exo_id ?? null, next: next?.exo_id ?? null };
}

export function readMapBoardFilters(params: SearchParamsLike): MapBoardFilters {
  return { q: params.get("q") ?? "", status: readStatus(params) };
}

export function mapBoardFiltersQuery(filters: MapBoardFilters): string {
  return toQuery(filters);
}

export function matchesMapBoardFilters(
  target: MuscleMapBoardTarget,
  filters: MapBoardFilters,
): boolean {
  if (filters.status !== "all" && target.status !== filters.status) return false;
  return matchesText(filters.q, target.name, target.code);
}

/** The filtered targets before and after `ref` in board order (each group, then its muscles). */
export function mapBoardNeighbours(
  targets: MuscleMapBoardTarget[],
  filters: MapBoardFilters,
  ref: MuscleMapTargetRef,
): { previous: MuscleMapBoardTarget | null; next: MuscleMapBoardTarget | null } {
  return neighboursAt(
    targets,
    targets.findIndex((t) => t.kind === ref.kind && t.id === ref.id),
    (t) => matchesMapBoardFilters(t, filters),
  );
}
