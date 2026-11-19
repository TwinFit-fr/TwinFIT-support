import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLOSED_LOOKUP_TABLES } from "./closed-lookups.ts";
import { findLookupRow, requireLookupRow, type LookupFinder } from "./lookup-find.ts";
import { requireCode } from "./normalize.ts";

describe("closed lookup lists", () => {
  it("lists the tables that only a backend migration extends", () => {
    for (const t of ["catalog_load_modalities", "catalog_logging_modes", "catalog_strength_patterns"])
      assert.ok(CLOSED_LOOKUP_TABLES.has(t));
    assert.ok(!CLOSED_LOOKUP_TABLES.has("catalog_equipment"));
  });
});

describe("lookup resolution", () => {
  const calls: string[] = [];
  const finder =
    (rows: Record<string, { id: string; code: string }[]>): LookupFinder =>
    async (code) => {
      calls.push(code);
      return rows;
    };

  it("returns an existing row, normalizing the code", async () => {
    const find = finder({ catalog_equipment: [{ id: "1", code: "BARBELL" }] });
    assert.deepEqual(await requireLookupRow(find, "catalog_equipment", " barbell "), {
      id: "1",
      code: "BARBELL",
    });
    assert.equal(calls.at(-1), "BARBELL");
  });
  it("fails on an unknown code instead of creating it", async () => {
    const find = finder({ catalog_equipment: [] });
    await assert.rejects(
      requireLookupRow(find, "catalog_equipment", "shiny_new"),
      /Unknown equipment code: SHINY_NEW\. Create it in Taxonomy first\./,
    );
    assert.equal(await findLookupRow(find, "catalog_equipment", "shiny_new"), null);
  });
  it("rejects an empty code", async () => {
    await assert.rejects(requireLookupRow(finder({}), "catalog_positions", "  "), /Empty code/);
  });
});

describe("requireCode", () => {
  it("returns the first non-empty candidate", () => {
    assert.equal(requireCode("position", "", " SEATED "), "SEATED");
  });
  it("fails when empty, with no default", () => {
    assert.throws(() => requireCode("position", "", undefined, null), /position is required/);
    assert.throws(() => requireCode("load modality", "  "), /load modality is required/);
  });
});
