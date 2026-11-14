import assert from "node:assert/strict";
import test from "node:test";
import { parsePairStrengthPattern } from "./pair-strength-pattern.ts";

test("empty or inherit clears the override", () => {
  assert.deepEqual(parsePairStrengthPattern(""), { override: false, code: null });
  assert.deepEqual(parsePairStrengthPattern(undefined), { override: false, code: null });
  assert.deepEqual(parsePairStrengthPattern("inherit"), { override: false, code: null });
});

test("none is isolation with the override", () => {
  assert.deepEqual(parsePairStrengthPattern("none"), { override: true, code: null });
});

test("a code overrides with that pattern", () => {
  assert.deepEqual(parsePairStrengthPattern("squat"), { override: true, code: "SQUAT" });
});
