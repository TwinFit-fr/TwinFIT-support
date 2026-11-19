import assert from "node:assert/strict";
import test from "node:test";
import { TARGET_MUSCLE_REQUIRED, requireTargetMuscleCode } from "./target-muscle.ts";

test("a given target muscle is kept, trimmed", () => {
  assert.equal(requireTargetMuscleCode({ target_muscle_code: " ANTERIOR_DELTS " }), "ANTERIOR_DELTS");
});

test("a missing or empty target muscle fails with a clear message, never null", () => {
  for (const target_muscle_code of [undefined, null, "", "   "]) {
    assert.throws(() => requireTargetMuscleCode({ target_muscle_code }), { message: TARGET_MUSCLE_REQUIRED });
  }
});
