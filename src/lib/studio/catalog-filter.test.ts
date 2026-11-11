import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closeTo,
  countStates,
  exerciseState,
  filterExercises,
  isFiltered,
  matchesQuery,
  nextRowIndex,
  parseFilter,
  queryWords,
  serializeFilter,
  type CatalogFilter,
} from "./catalog-filter.ts";

const v = (ready = 0, queued = 0, failed = 0) => ({ total: ready + queued + failed, ready, queued, failed, active: ready > 0 });
const ref = (code: string, name: string) => ({ code, name }) as never;
const ex = (exo_id: number, name: string, vectors = v(), group = "CHEST", equipment = "Barbell") => ({
  exo_id,
  display_name: name,
  group: ref(group, group === "CHEST" ? "Chest" : "Back"),
  equipment: ref("EQ", equipment),
  target_muscle: ref("T", "Pectoralis"),
  vectors,
});
const all: CatalogFilter = { status: "all", group: null };

describe("state of an exercise", () => {
  it("reads it from its clips", () => {
    assert.equal(exerciseState(v()), "todo");
    assert.equal(exerciseState(v(1)), "ready");
    assert.equal(exerciseState(v(1, 1, 1)), "ready");
    assert.equal(exerciseState(v(0, 1, 1)), "queued");
    assert.equal(exerciseState(v(0, 0, 2)), "failed");
  });

  it("counts them", () => {
    const counts = countStates([ex(1, "a"), ex(2, "b", v(1)), ex(3, "c", v(0, 0, 1)), ex(4, "d", v(0, 1))]);
    assert.deepEqual(counts, { todo: 1, ready: 1, failed: 1, queued: 1, total: 4 });
  });
});

describe("search", () => {
  const bench = ex(12, "Bench Press", v(), "CHEST", "Barbell");
  const words = (q: string) => queryWords(q);

  it("finds by name, group, equipment and muscle", () => {
    assert.ok(matchesQuery(bench, words("bench")));
    assert.ok(matchesQuery(bench, words("chest barbell")));
    assert.ok(matchesQuery(bench, words("PECTORALIS")));
    assert.ok(!matchesQuery(bench, words("squat")));
  });

  it("finds number 12 with 12 and #12", () => {
    assert.ok(matchesQuery(bench, words("12")));
    assert.ok(matchesQuery(bench, words("#12")));
    assert.ok(!matchesQuery(bench, words("#1")));
    assert.ok(!matchesQuery(bench, words("#")));
  });

  it("treats a hash as the number only, not as text", () => {
    assert.ok(!matchesQuery(ex(5, "Cable 12 Fly"), words("#12")));
    assert.ok(matchesQuery(ex(5, "Cable 12 Fly"), words("12")));
  });

  it("folds accents", () => {
    assert.ok(matchesQuery(ex(1, "Elevación lateral"), words("elevacion")));
    assert.ok(matchesQuery(ex(1, "Elevacion lateral"), words("elevación")));
  });
});

describe("filters combine", () => {
  const list = [ex(1, "A", v(1)), ex(2, "B"), ex(3, "C", v(0, 0, 1)), ex(4, "D", v(), "BACK"), ex(5, "E", v(0, 1))];
  const ids = (f: CatalogFilter, q = "") => filterExercises(list, f, queryWords(q)).map((e) => e.exo_id);

  it("status alone", () => {
    assert.deepEqual(ids(all), [1, 2, 3, 4, 5]);
    assert.deepEqual(ids({ status: "todo", group: null }), [2, 4]);
    assert.deepEqual(ids({ status: "ready", group: null }), [1]);
    assert.deepEqual(ids({ status: "attention", group: null }), [3]);
  });

  it("status with group and search", () => {
    assert.deepEqual(ids({ status: "todo", group: "BACK" }), [4]);
    assert.deepEqual(ids({ status: "todo", group: "CHEST" }), [2]);
    assert.deepEqual(ids({ status: "todo", group: "CHEST" }, "#4"), []);
  });

  it("knows when something narrows the list", () => {
    assert.equal(isFiltered(all, "  "), false);
    assert.equal(isFiltered(all, "a"), true);
    assert.equal(isFiltered({ status: "todo", group: null }, ""), true);
  });
});

describe("remembered filter", () => {
  it("round-trips", () => {
    const f: CatalogFilter = { status: "attention", group: "BACK" };
    assert.deepEqual(parseFilter(serializeFilter(f)), f);
  });

  it("falls back on anything that is not ours", () => {
    assert.deepEqual(parseFilter(null), all);
    assert.deepEqual(parseFilter("{nope"), all);
    assert.deepEqual(parseFilter("42"), all);
    assert.deepEqual(parseFilter('{"status":"x","group":7}'), all);
  });
});

describe("row navigation", () => {
  it("moves without leaving the list", () => {
    assert.equal(nextRowIndex("ArrowDown", 0, 3), 1);
    assert.equal(nextRowIndex("ArrowDown", 2, 3), 2);
    assert.equal(nextRowIndex("ArrowUp", 0, 3), 0);
    assert.equal(nextRowIndex("ArrowDown", -1, 3), 0);
    assert.equal(nextRowIndex("End", 0, 50), 49);
    assert.equal(nextRowIndex("PageDown", 45, 50), 49);
    assert.equal(nextRowIndex("Home", 9, 50), 0);
  });

  it("ignores other keys and empty lists", () => {
    assert.equal(nextRowIndex("a", 0, 3), null);
    assert.equal(nextRowIndex("ArrowDown", 0, 0), null);
  });
});

describe("typos", () => { it("a misspelt word finds the close name only when nothing matches exactly", () => {
  assert.equal(closeTo("dumbel", "dumbbell"), true);
  assert.equal(closeTo("squat", "bench"), false);
  const mk = (exo_id: number, name: string) =>
    ({ exo_id, display_name: name, group: null, equipment: null, target_muscle: null, vectors: { total: 0, ready: 0, queued: 0, failed: 0 } }) as never;
  const list = [mk(1, "Dumbbell Curl"), mk(2, "Cable Row")];
  const found = filterExercises(list, { status: "all", group: null }, queryWords("dumbel"));
  assert.equal(found.length, 1);
}); });
