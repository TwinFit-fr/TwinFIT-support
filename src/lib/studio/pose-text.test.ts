import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePoseText } from "./pose-text.ts";

describe("normalizePoseText", () => {
  it("spells out the flexion of an included angle", () => {
    assert.deepEqual(normalizePoseText("Knees at about 150°, hips near 170 degrees."), {
      text: "Knees at about 150° (Knees flexion 30°), hips near 170 degrees (hips flexion 10°).",
      included: 2,
    });
  });

  it("leaves flexion and right angles as they are", () => {
    const text = "Hips flexed 90°, knees 90°, elbows flexed 20°, knees at 90°.";
    assert.deepEqual(normalizePoseText(text), { text, included: 0 });
  });
});
