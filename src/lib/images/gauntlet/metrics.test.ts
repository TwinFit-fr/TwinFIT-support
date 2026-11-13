import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { frameFromRgba, type Frame } from "./mask.ts";
import { chiSquare, ghostingLoss, logoStats, tier1 } from "./metrics.ts";

const SIZE = 256;
const NAVY = [15, 31, 61];
const CYAN = [0, 200, 210];

/** Navy figure with a cyan chest logo; `dx` shifts everything, `armY` moves the arms. */
function figure(
  opts: { dx?: number; armY?: number | null; logo?: boolean; color?: number[]; opaque?: boolean } = {},
): Frame {
  const { dx = 0, armY = 120, logo = true, color = NAVY, opaque = false } = opts;
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  if (opaque) for (let i = 0; i < SIZE * SIZE; i++) rgba.set([255, 255, 255, 255], i * 4);
  const fill = (x0: number, y0: number, x1: number, y1: number, c: number[]) => {
    for (let y = y0; y <= y1; y++) for (let x = x0 + dx; x <= x1 + dx; x++) rgba.set([...c, 255], (y * SIZE + x) * 4);
  };
  fill(96, 200, 160, 220, color);
  fill(116, 60, 140, 200, color);
  if (armY !== null) fill(60, armY, 196, armY + 12, color);
  if (logo) fill(130, 80, 136, 88, CYAN);
  return frameFromRgba(rgba, SIZE);
}

const UPRIGHT = { positionCode: "UPRIGHT", equipmentCode: "DUMBBELL" };

describe("tier1", () => {
  it("passes a clean set where only the arms move", () => {
    const r = tier1([figure(), figure({ armY: 70 })], [0, 2], UPRIGHT);
    assert.deepEqual(r.failures, []);
    assert.equal(r.score, 100);
    assert.equal(r.anchor, "floor");
  });

  it("reports a small drift as fixable and leaves one it cannot fit to a look by eye", () => {
    const small = tier1([figure(), figure({ dx: 8 })], [0, 2], UPRIGHT);
    assert.deepEqual(small.failures.map((f) => f.code), ["drift"]);
    const big = tier1([figure(), figure({ dx: 40 })], [0, 2], UPRIGHT);
    assert.deepEqual(big.failures.map((f) => f.code), ["anchor_mismatch"]);
  });

  it("catches a lost logo, a colour change, an opaque background and a mixed set", () => {
    const r = tier1(
      [figure(), figure({ logo: false, color: [200, 30, 30], opaque: true })],
      [0, 2],
      UPRIGHT,
      { setMismatch: true },
    );
    const codes = r.failures.map((f) => f.code);
    for (const code of ["logo_missing", "palette_shift", "opaque_background", "set_mismatch"]) {
      assert.ok(codes.includes(code as never), `${code} in ${codes}`);
    }
  });

  it("flags an empty frame", () => {
    const empty = frameFromRgba(new Uint8Array(SIZE * SIZE * 4), SIZE);
    const r = tier1([figure(), empty], [0, 2], UPRIGHT);
    assert.equal(r.failures[0].code, "empty_frame");
    assert.equal(r.score, 0);
  });
});

describe("helpers", () => {
  it("finds the cyan logo on the chest", () => {
    const s = logoStats(figure());
    assert.equal(s.area, 7 * 9);
    assert.equal(s.cx, 133);
  });

  it("measures identical histograms as 0 apart", () => {
    const h = new Float64Array([0.5, 0.5]);
    assert.equal(chiSquare(h, h), 0);
  });

  it("measures how much of the figure an interpolated frame loses", () => {
    assert.equal(ghostingLoss(figure(), figure({ armY: 70 }), figure()), 0);
    // A middle frame with no arms lost them to ghosting.
    const armless = figure({ armY: null });
    assert.ok(ghostingLoss(figure(), armless, figure()) > 0.15);
  });
});

describe("tier2 helpers", async () => {
  const { RUBRIC, reviewPrompt, scoreChecks } = await import("./vlm.ts");
  it("scores 100 when every check passes and 0 when none does", () => {
    const all = (ok: boolean) =>
      Object.fromEntries(Object.keys(RUBRIC).map((k) => [k, { ok }])) as Parameters<typeof scoreChecks>[0];
    assert.equal(scoreChecks(all(true)), 100);
    assert.equal(scoreChecks(all(false)), 0);
  });

  it("lists every frame with its pose and every check", () => {
    const text = reviewPrompt({
      name: "Pull-Up",
      frames: [{ label: "Start", pose: "dead hang" }, { label: "End", pose: null }],
      sheet: Buffer.alloc(0),
    });
    assert.match(text, /Frame 1 \(Start\): dead hang/);
    assert.match(text, /Frame 2 \(End\): no pose text/);
    for (const k of Object.keys(RUBRIC)) assert.match(text, new RegExp(`- ${k}:`));
  });
});

describe("verdict", async () => {
  const { verdict, combinedScore } = await import("./judge.ts");
  const { RUBRIC } = await import("./vlm.ts");
  const t2 = (fails: string[]) => ({
    model: "m",
    checks: Object.fromEntries(Object.keys(RUBRIC).map((k) => [k, { ok: !fails.includes(k), reason: "" }])),
    worstFrame: null,
    score: 100 - fails.length * 10,
    usage: { prompt_tokens: null, completion_tokens: null },
  }) as never;
  const clean = tier1([figure(), figure({ armY: 70 })], [0, 2], UPRIGHT);

  it("passes a clean set the model also passes", () => {
    assert.equal(verdict(clean, t2([])), "good");
    assert.equal(combinedScore(clean, t2([])), 100);
  });

  it("rejects a wrong start posture and a frame made from another Start", () => {
    assert.equal(verdict(clean, t2(["start_posture"])), "bad");
    const mixed = tier1([figure(), figure({ armY: 70 })], [0, 2], UPRIGHT, { setMismatch: true });
    assert.equal(verdict(mixed, t2([])), "bad");
  });

  it("asks for a look at two other vision failures", () => {
    assert.equal(verdict(clean, t2(["poses_match"])), "good");
    assert.equal(verdict(clean, t2(["poses_match", "motion"])), "check");
  });
});
