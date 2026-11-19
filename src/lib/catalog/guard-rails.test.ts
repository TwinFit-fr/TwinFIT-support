import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextExoIdFrom } from "./exo-id.ts";
import { findLookupRow, requireLookupRow, type LookupFinder } from "./lookup-find.ts";
import { requireCode } from "./normalize.ts";

describe("nextExoIdFrom", () => {
  it("is max + 1 and never reuses a gap", () => {
    const ids = Array.from({ length: 190 }, (_, i) => i + 1).filter((n) => n !== 177 && n !== 189);
    assert.equal(nextExoIdFrom(ids), 191);
    assert.notEqual(nextExoIdFrom(ids), 177);
    assert.notEqual(nextExoIdFrom(ids), 189);
  });
  it("works on the largest id alone and on an empty catalog", () => {
    assert.equal(nextExoIdFrom([190]), 191);
    assert.equal(nextExoIdFrom([]), 1);
  });
  it("ignores invalid values", () => {
    assert.equal(nextExoIdFrom([3, Number.NaN, -5]), 4);
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
