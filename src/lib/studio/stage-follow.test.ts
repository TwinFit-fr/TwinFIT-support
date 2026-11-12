import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SIZE_SETTLE_MS, START_FOLLOW, followStep, outgrows, watchSize, type Bounds, type FollowState } from "./stage-follow.ts";

const STANDING: Bounds = { min: [-0.3, 0, -0.15], max: [0.3, 1.8, 0.15] };
const SEATED: Bounds = { min: [-0.3, 0, -0.2], max: [0.3, 1.3, 0.5] };
const LYING: Bounds = { min: [-0.3, 0, -0.9], max: [0.3, 0.3, 0.9] };
const nudge = (b: Bounds, d: number): Bounds => ({ min: [b.min[0] + d, b.min[1], b.min[2]], max: [b.max[0] + d, b.max[1], b.max[2]] });

function run(boxes: Bounds[], moving: boolean, from: FollowState = START_FOLLOW) {
  let state = from;
  const frames: (Bounds | null)[] = [];
  for (const box of boxes) {
    const r = followStep(state, box, moving);
    state = r.state;
    frames.push(r.frame);
  }
  return { state, frames };
}

describe("following the body when an exercise opens", () => {
  it("frames a held pose once it has stopped changing, not before", () => {
    const { frames } = run([STANDING, STANDING, STANDING, STANDING], false);
    assert.deepEqual(frames, [null, null, STANDING, null]);
  });

  it("frames again when the poses arrive and the body settles somewhere else (standing, then seated)", () => {
    const { frames } = run([STANDING, STANDING, STANDING, SEATED, SEATED, SEATED, SEATED], false);
    assert.deepEqual(frames, [null, null, STANDING, null, null, SEATED, null]);
  });

  it("does not frame again for a small change of the held pose", () => {
    const first = run([LYING, LYING, LYING], false);
    const { frames } = run([nudge(LYING, 0.04), nudge(LYING, 0.04), nudge(LYING, 0.04)], false, first.state);
    assert.deepEqual(frames, [null, null, null]);
  });

  it("frames a moving body at once and then only grows, never pumping in and out", () => {
    const squatBottom: Bounds = { min: [-0.3, 0, -0.3], max: [0.3, 1.2, 0.4] };
    const { frames, state } = run([STANDING, squatBottom, STANDING, squatBottom, STANDING], true);
    assert.deepEqual(frames[0], STANDING);
    // The squat reaches further forward than standing: framed once, as everything seen so far.
    assert.ok(frames[1]);
    assert.deepEqual(frames.slice(2), [null, null, null]);
    assert.ok(!outgrows(state.framed!, STANDING) && !outgrows(state.framed!, squatBottom));
  });

  it("tells when a box reaches past another", () => {
    assert.equal(outgrows(STANDING, SEATED), true);
    assert.equal(outgrows(STANDING, nudge(STANDING, 0.05)), false);
  });
});

describe("waiting for the stage's final size", () => {
  it("is settled only after the size held for SIZE_SETTLE_MS", () => {
    let r = watchSize(null, 800, 600, 1000);
    assert.equal(r.settled, false);
    r = watchSize(r.watch, 800, 600, 1000 + SIZE_SETTLE_MS - 1);
    assert.equal(r.settled, false);
    r = watchSize(r.watch, 800, 600, 1000 + SIZE_SETTLE_MS);
    assert.equal(r.settled, true);
  });
  it("starts over whenever the size changes", () => {
    let r = watchSize(null, 800, 600, 0);
    r = watchSize(r.watch, 800, 600, 400);
    assert.equal(r.settled, true);
    r = watchSize(r.watch, 640, 600, 500);
    assert.equal(r.settled, false);
    assert.equal(watchSize(r.watch, 640.4, 600, 500 + SIZE_SETTLE_MS).settled, true);
  });
});
