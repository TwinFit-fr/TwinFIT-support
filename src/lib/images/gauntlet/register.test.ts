import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anchorFor, anchorWindow } from "./anchors.ts";
import { bbox, frameFromRgba, iou, type Frame } from "./mask.ts";
import { register } from "./register.ts";

const SIZE = 256;

/** A stick figure: feet block at the bottom, body column, arms whose height is `armY`. */
function figure(opts: { dx?: number; dy?: number; scale?: number; armY?: number } = {}): Frame {
  const { dx = 0, dy = 0, scale = 1, armY = 120 } = opts;
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  const pivot = { x: 128, y: 220 };
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const sx = (x - dx - pivot.x) / scale + pivot.x;
        const sy = (y - dy - pivot.y) / scale + pivot.y;
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) rgba[(y * SIZE + x) * 4 + 3] = 255;
      }
    }
  };
  fill(96, 200, 160, 220); // feet
  fill(116, 60, 140, 200); // body
  fill(60, armY, 196, armY + 12); // arms
  return frameFromRgba(rgba, SIZE);
}

describe("anchorFor", () => {
  it("hangs pull-ups from the bar, benches on the support band, the rest on the floor", () => {
    assert.equal(anchorFor({ supportCode: "PULL_UP_BAR" }), "bar");
    assert.equal(anchorFor({ supportCode: "BENCH", positionCode: "SUPINE" }), "support");
    assert.equal(anchorFor({ positionCode: "PRONE" }), "support");
    assert.equal(anchorFor({ equipmentCode: "CABLE", positionCode: "UPRIGHT" }), "support");
    assert.equal(anchorFor({ equipmentCode: "DUMBBELL", positionCode: "UPRIGHT" }), "floor");
  });

  it("puts a floor window at the bottom and a bar window at the top of the drawing", () => {
    const box = { x0: 20, y0: 40, x1: 200, y1: 240 };
    const floor = anchorWindow("floor", box, SIZE);
    const bar = anchorWindow("bar", box, SIZE);
    assert.ok(floor.y0 >= 190 && floor.y1 >= 240);
    assert.ok(bar.y0 <= 40 && bar.y1 < 80);
  });
});

describe("register", () => {
  it("leaves an identical frame alone", () => {
    const reg = register(figure(), figure({ armY: 70 }), "floor");
    assert.ok(reg);
    assert.equal(reg.scale, 1);
    assert.equal(reg.dx, 0);
    assert.equal(reg.dy, 0);
    assert.equal(reg.atLimit, false);
  });

  it("finds a sideways and vertical drift of the feet, ignoring the moving arms", () => {
    const reg = register(figure(), figure({ dx: 10, dy: -6, armY: 70 }), "floor");
    assert.ok(reg);
    assert.ok(Math.abs(reg.dx * SIZE + 10) <= 1, `dx ${reg.dx * SIZE}`);
    assert.ok(Math.abs(reg.dy * SIZE - 6) <= 1, `dy ${reg.dy * SIZE}`);
    assert.ok(reg.iouAfter > reg.iouBefore);
  });

  it("finds a zoom of a few percent from a deep support band", () => {
    const reg = register(figure(), figure({ scale: 1.07 }), "support");
    assert.ok(reg);
    assert.ok(Math.abs(reg.scale - 1 / 1.07) < 0.025, `scale ${reg.scale}`);
  });

  it("flags a frame moved beyond the limits as re-framed", () => {
    const reg = register(figure(), figure({ dx: 40 }), "floor");
    assert.ok(reg);
    assert.equal(reg.atLimit, true);
  });

  it("returns null for an empty frame", () => {
    const empty = frameFromRgba(new Uint8Array(SIZE * SIZE * 4), SIZE);
    assert.equal(register(figure(), empty, "floor"), null);
    assert.equal(bbox(empty.mask, SIZE), null);
    assert.equal(iou(empty.mask, empty.mask, SIZE), 1);
  });
});
