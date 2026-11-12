import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changedFields, isFormDirty, refillUntouched } from "./form-dirty.ts";

describe("dialog form dirty check", () => {
  it("is clean when nothing changed, or only whitespace and empty forms differ", () => {
    assert.equal(isFormDirty({ a: "x", b: 4, c: true, d: null }, { a: " x ", b: "4", c: true, d: "" }), false);
    assert.equal(isFormDirty({}, { hint: "" }), false);
  });

  it("is dirty when a value was typed, changed or toggled", () => {
    assert.deepEqual(changedFields({ a: "x", b: 4, c: true }, { a: "y", b: 5, c: false }), ["a", "b", "c"]);
    assert.equal(isFormDirty({}, { hint: "wood grain" }), true);
    assert.equal(isFormDirty({ template: "A {x}" }, { template: "A {x} more" }), true);
  });

  it("treats a non-finite number as empty", () => {
    assert.equal(isFormDirty({ n: null }, { n: Number.NaN }), false);
  });
});

describe("a form that fills itself in", () => {
  it("refills untouched fields and keeps typed ones, which stay dirty", () => {
    const baseline = { code: "MANNEQUIN_MIXAMO", name: "Mannequin", height: "1.75" };
    const current = { code: "MANNEQUIN_MIXAMO", name: "Coach Ana", height: "1.75" };
    const { values, baseline: next } = refillUntouched(current, baseline, { code: "TWINFIT_MAN", name: "TwinFIT man" });
    assert.deepEqual(values, { code: "TWINFIT_MAN", name: "Coach Ana", height: "1.75" });
    assert.equal(next.code, "TWINFIT_MAN");
    assert.equal(isFormDirty(next, values), true);
    assert.deepEqual(changedFields(next, values), ["name"]);
  });

  it("leaves a clean form clean", () => {
    const start = { code: "A", name: "B" };
    const { values, baseline } = refillUntouched(start, start, { code: "C", name: "D" });
    assert.equal(isFormDirty(baseline, values), false);
  });
});
