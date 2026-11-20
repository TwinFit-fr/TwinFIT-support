import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boardFiltersQuery,
  matchesBoardFilters,
  matchesReviewFilter,
  readBoardFilters,
} from "./board-filters.ts";
import type { ExerciseImageBoardItem } from "./types.ts";

const params = (query: string) => new URLSearchParams(query);

function item(patch: Partial<ExerciseImageBoardItem> = {}): ExerciseImageBoardItem {
  return {
    id: "1",
    exo_id: 1,
    display_name: "Bench Press",
    status: "complete",
    primary_muscle_group: null,
    equipment: null,
    review_counts: { pending: 0, approved: 3, rejected: 0 },
    unpublished: false,
    ...patch,
  } as ExerciseImageBoardItem;
}

describe("review filter", () => {
  it("reads and writes the review filter in the URL", () => {
    assert.equal(readBoardFilters(params("review=pending")).review, "pending");
    assert.equal(readBoardFilters(params("review=nonsense")).review, "all");
    assert.equal(readBoardFilters(params("")).review, "all");
    const filters = readBoardFilters(params("review=unpublished&q=bench"));
    assert.equal(boardFiltersQuery(filters), "?q=bench&review=unpublished");
    assert.equal(boardFiltersQuery(readBoardFilters(params("review=all"))), "");
  });

  it("keeps the exercises with a frame of that review status", () => {
    const pending = item({ review_counts: { pending: 2, approved: 1, rejected: 0 } });
    assert.equal(matchesReviewFilter(pending, "pending"), true);
    assert.equal(matchesReviewFilter(item(), "pending"), false);
    assert.equal(matchesReviewFilter(item(), "approved"), true);
    assert.equal(matchesReviewFilter(item(), "rejected"), false);
    assert.equal(matchesReviewFilter(item(), "all"), true);
  });

  it("keeps the exercises whose active frames the app does not show", () => {
    assert.equal(matchesReviewFilter(item({ unpublished: true }), "unpublished"), true);
    assert.equal(matchesReviewFilter(item(), "unpublished"), false);
  });

  it("combines with the other board filters", () => {
    const filters = readBoardFilters(params("review=pending&status=complete&q=bench"));
    const pending = item({ review_counts: { pending: 1, approved: 0, rejected: 0 } });
    assert.equal(matchesBoardFilters(pending, filters), true);
    assert.equal(matchesBoardFilters(item(), filters), false);
    assert.equal(matchesBoardFilters({ ...pending, status: "partial" }, filters), false);
  });
});
