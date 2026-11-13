import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyRegistrationRaw, lockStatic } from "./apply.ts";

const W = 64;
function square(x0: number, color = [10, 20, 30]) {
  const data = new Uint8Array(W * W * 4);
  for (let y = 20; y < 30; y++) for (let x = x0; x < x0 + 10; x++) data.set([...color, 255], (y * W + x) * 4);
  return { data, width: W, height: W };
}
const alphaAt = (r: { data: Uint8Array }, x: number, y: number) => r.data[(y * W + x) * 4 + 3];

describe("applyRegistrationRaw", () => {
  it("is the identity for scale 1 and no shift", () => {
    const src = square(10);
    const out = applyRegistrationRaw(src, { scale: 1, dx: 0, dy: 0, pivot: { x: 0.5, y: 1 } });
    assert.deepEqual(out.data, src.data);
  });

  it("shifts a shape by whole pixels", () => {
    const out = applyRegistrationRaw(square(10), { scale: 1, dx: 5 / W, dy: 0, pivot: { x: 0.5, y: 1 } });
    assert.equal(alphaAt(out, 14, 25), 0);
    assert.equal(alphaAt(out, 15, 25), 255);
    assert.equal(alphaAt(out, 24, 25), 255);
  });
});

describe("lockStatic", () => {
  it("copies the Start where the candidate nearly matches and keeps real changes", () => {
    const start = square(10, [10, 20, 30]);
    const near = square(10, [14, 24, 30]);
    const moved = square(30, [10, 20, 30]);
    const a = lockStatic(start, near);
    assert.equal(a.locked, 100);
    assert.deepEqual(a.raw.data, start.data);
    const b = lockStatic(start, moved);
    assert.equal(b.locked, 0);
    assert.deepEqual(b.raw.data, moved.data);
  });
});

describe("agent helpers", async () => {
  const { withCorrections, agentPrompt } = await import("./agent.ts");
  it("appends at most four corrections to the base prompt", () => {
    const out = withCorrections("BASE {pose}", ["a", " ", "b", "c", "d", "e"]);
    assert.equal(out, "BASE {pose}\n\nCORRECTIONS FOR THIS EXERCISE:\n- a\n- b\n- c\n- d");
    assert.equal(withCorrections("BASE", []), "BASE");
  });

  it("lists failures and earlier corrections", () => {
    const text = agentPrompt({
      exercise: "Pull-Up",
      frameLabel: "End",
      pose: "chin over bar",
      basePrompt: "BASE",
      failures: [{ code: "drift", frame: 2, detail: "moved" }],
      vision: [{ check: "hands_on_equipment", reason: "left hand off" }],
      history: [{ override: withCorrections("BASE", ["Keep hands on bar."]), skip: ["logo"], verdict: "bad", score: 40, failures: ["drift"] }],
    });
    assert.match(text, /\[silhouette\] drift: moved/);
    assert.match(text, /\[vision\] hands_on_equipment: left hand off/);
    assert.match(text, /corrections: - Keep hands on bar\./);
  });
});
