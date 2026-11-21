import assert from "node:assert/strict";
import test from "node:test";
import { summarizeChange } from "./history.ts";

test("exercise history: the fields an update changed, ids and timestamps left out", () => {
  const entry = summarizeChange({
    id: 7,
    changed_at: "2026-11-21T10:00:00Z",
    actor: "staff:abc",
    table_name: "exercises",
    row_key: "12",
    op: "UPDATE",
    old_row: { id: "x", exo_id: 12, display_name: "A", muscles_inherited: true, updated_at: "1" },
    new_row: { id: "x", exo_id: 12, display_name: "B", muscles_inherited: false, updated_at: "2" },
  });
  assert.equal(entry.what, "exercise");
  assert.deepEqual(entry.changes, [
    { field: "display_name", from: "A", to: "B" },
    { field: "muscles_inherited", from: true, to: false },
  ]);
});

test("exercise history: localizations and secondary muscles name their key", () => {
  const base = { id: 1, changed_at: "", actor: null, old_row: null, new_row: {}, op: "INSERT" as const };
  assert.equal(summarizeChange({ ...base, table_name: "exercise_localizations", row_key: "12:es" }).what, "name es");
  assert.equal(summarizeChange({ ...base, table_name: "exercise_secondary_muscles", row_key: "12:TRICEPS" }).what, "secondary muscle TRICEPS");
});
