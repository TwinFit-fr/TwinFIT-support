import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BADGE_PX, clearOf, type Box } from "./badge-place.ts";

const W = 860;
const H = 700;
/** The drag hint and the toolbar at the bottom of the stage, a status card at the top left. */
const HINT: Box = { left: 260, top: 580, right: 600, bottom: 620 };
const TOOLBAR: Box = { left: 270, top: 630, right: 590, bottom: 690 };
const CARD: Box = { left: 10, top: 10, right: 200, bottom: 60 };

describe("badge placement on the stage", () => {
  it("keeps a badge where it is when nothing is under it", () => {
    assert.deepEqual(clearOf(400, 300, [HINT, TOOLBAR, CARD], W, H), { x: 400, y: 300 });
  });

  it("lifts a badge that would sit on the drag hint above it", () => {
    const at = clearOf(400, 590, [HINT, TOOLBAR, CARD], W, H);
    assert.equal(at.x, 400);
    assert.equal(at.y, HINT.top - BADGE_PX);
  });

  it("lifts a badge on the toolbar above the hint too", () => {
    const at = clearOf(400, 650, [HINT, TOOLBAR, CARD], W, H);
    assert.equal(at.y, HINT.top - BADGE_PX);
  });

  it("drops a badge on a card at the top below it", () => {
    assert.deepEqual(clearOf(50, 20, [HINT, TOOLBAR, CARD], W, H), { x: 50, y: CARD.bottom });
  });

  it("keeps a badge inside the stage", () => {
    assert.deepEqual(clearOf(-20, -20, [], W, H), { x: 4, y: 4 });
    assert.deepEqual(clearOf(W, H, [], W, H), { x: W - BADGE_PX - 4, y: H - BADGE_PX - 4 });
  });
});
