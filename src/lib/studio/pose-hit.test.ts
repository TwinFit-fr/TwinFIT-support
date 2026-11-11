import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HIT_MAX_PX, HIT_MIN_PX, dotScale, hitSize, neighbourGaps, nudgeKeepsAim, nudgeMetres, pickPoint, type ScreenPoints } from "./pose-hit.ts";

// A far-away body: the hand is raised by the head, the knees and the feet 16 px apart.
const FAR: ScreenPoints = {
  head: { x: 600, y: 295 },
  left_hand: { x: 612, y: 300 },
  left_knee: { x: 612, y: 434 },
  right_knee: { x: 596, y: 431 },
  left_foot: { x: 612, y: 484 },
  right_foot: { x: 596, y: 480 },
};

describe("which point a press means", () => {
  it("a press on a dot gets that point, even where its hit area overlaps a neighbour's", () => {
    for (const [id, p] of Object.entries(FAR)) assert.equal(pickPoint(FAR, p), id);
  });
  it("between two points, the nearer centre wins", () => {
    assert.equal(pickPoint(FAR, { x: 603, y: 296 }), "head");
    assert.equal(pickPoint(FAR, { x: 609, y: 299 }), "left_hand");
    assert.equal(pickPoint(FAR, { x: 599, y: 432 }), "right_knee");
    assert.equal(pickPoint(FAR, { x: 609, y: 433 }), "left_knee");
  });
  it("an exact tie goes to the hand", () => {
    assert.equal(pickPoint(FAR, { x: 606, y: 297.5 }), "left_hand");
  });
  it("empty space is nobody's", () => {
    assert.equal(pickPoint(FAR, { x: 700, y: 300 }), null);
    assert.equal(pickPoint(FAR, { x: 600, y: 295 + HIT_MAX_PX / 2 + 4 }), null);
  });
  it("a point's own radius bounds it", () => {
    assert.equal(pickPoint(FAR, { x: 600, y: 307 }, () => 10), null);
    assert.equal(pickPoint(FAR, { x: 600, y: 303 }, () => 10), "head");
  });
});

describe("crowded points", () => {
  it("measures each point's gap to its nearest neighbour", () => {
    const gaps = neighbourGaps(FAR);
    assert.ok(Math.abs(gaps.left_knee! - Math.hypot(16, 3)) < 1e-9);
    assert.ok(Math.abs(gaps.head! - 13) < 1e-9);
    assert.equal(neighbourGaps({ hips: { x: 0, y: 0 } }).hips, Infinity);
  });
  it("hit areas stay between 24 and 32 px", () => {
    assert.equal(hitSize(5), HIT_MIN_PX);
    assert.equal(hitSize(28), 28);
    assert.equal(hitSize(Infinity), HIT_MAX_PX);
  });
  it("dots shrink when crowded, never below about half size", () => {
    assert.equal(dotScale(40), 1);
    assert.ok(dotScale(16) < 0.75 && dotScale(16) >= 0.55);
    assert.equal(dotScale(2), 0.55);
  });
});

describe("arrow-key nudges", () => {
  it("are 4 px (Shift: 20 px) on screen, within sane world limits", () => {
    assert.ok(Math.abs(nudgeMetres(0.005, false) - 0.02) < 1e-12);
    assert.ok(Math.abs(nudgeMetres(0.005, true) - 0.1) < 1e-12);
    assert.equal(nudgeMetres(0.0001, false), 0.002);
    assert.equal(nudgeMetres(1, false), 0.05);
  });
});

describe("where a nudge starts", () => {
  it("from the last aim while the body keeps up on screen", () => {
    assert.equal(nudgeKeepsAim({ x: 10, y: 0 }, { x: 13, y: 0 }, 4), true);
  });
  it("from the point once it falls behind (a limit)", () => {
    assert.equal(nudgeKeepsAim({ x: 0, y: 0 }, { x: 8, y: 0 }, 4), false);
  });
  it("from the point when nothing was aimed", () => {
    assert.equal(nudgeKeepsAim({ x: 0, y: 0 }, null, 4), false);
  });
});
