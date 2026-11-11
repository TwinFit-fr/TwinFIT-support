import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEUTRAL_POSE, poseClipFromDraft, type LoopMode } from "./anatomy.ts";
import {
  adjacentKey,
  clampTime,
  describeTime,
  formatSeconds,
  heldKeyTime,
  keyAt,
  keyTolerance,
  nearestKey,
  poseName,
  rulerTicks,
  snapToKey,
  spanAt,
  timelineKeys,
  wrapTime,
} from "./timeline.ts";

const doc = (poseCount: number, durationS: number, mode: LoopMode, weights: number[] | null = null) => ({ poseCount, durationS, mode, weights });
const times = (keys: { t: number }[]) => keys.map((k) => Math.round(k.t * 1000) / 1000);

describe("timelineKeys", () => {
  it("places the poses of a cycle evenly and returns to the first", () => {
    const keys = timelineKeys(doc(3, 3, "cycle"));
    assert.deepEqual(times(keys), [0, 1, 2, 3]);
    assert.deepEqual(keys.map((k) => k.pose), [0, 1, 2, 0]);
    assert.deepEqual(keys.map((k) => k.repeat), [false, false, false, true]);
  });

  it("goes there and back for a boomerang, marking the way back as repeats", () => {
    const keys = timelineKeys(doc(3, 4, "pingpong"));
    assert.deepEqual(times(keys), [0, 1, 2, 3, 4]);
    assert.deepEqual(keys.map((k) => k.pose), [0, 1, 2, 1, 0]);
    assert.deepEqual(keys.map((k) => k.repeat), [false, false, false, true, true]);
  });

  it("plays once without a return", () => {
    const keys = timelineKeys(doc(3, 4, "once"));
    assert.deepEqual(times(keys), [0, 2, 4]);
    assert.deepEqual(keys.map((k) => k.pose), [0, 1, 2]);
  });

  it("spreads time by the tempo weights (weights[0] is a cycle's way back)", () => {
    assert.deepEqual(times(timelineKeys(doc(3, 4, "cycle", [1, 2, 1]))), [0, 2, 3, 4]);
    assert.deepEqual(times(timelineKeys(doc(2, 3, "pingpong", [1, 2]))), [0, 1.5, 3], "the way back reuses the tempo");
  });

  it("ignores weights of the wrong length and holds a single pose for the whole loop", () => {
    assert.deepEqual(times(timelineKeys(doc(3, 3, "cycle", [5, 1]))), [0, 1, 2, 3]);
    const single = timelineKeys(doc(1, 2, "pingpong"));
    assert.deepEqual(single, [{ t: 0, pose: 0, repeat: false }, { t: 2, pose: 0, repeat: true }]);
    assert.deepEqual(timelineKeys(doc(0, 2, "cycle")), []);
  });

  it("matches the keyframes the clip builder plays", () => {
    for (const mode of ["cycle", "pingpong", "once"] as const) {
      const weights = [1.5, 0.5, 2, 1];
      const clip = poseClipFromDraft({ poses: [NEUTRAL_POSE, NEUTRAL_POSE, NEUTRAL_POSE, NEUTRAL_POSE], mode, durationS: 5, fps: 30, twoHanded: false, grip: null, weights, meta: {} });
      const keys = timelineKeys(doc(4, 5, mode, weights));
      assert.deepEqual(keys.map((k) => [k.t, k.pose]), clip.keyframes.map((k) => [k.t, k.position]), mode);
    }
  });
});

describe("time to keys", () => {
  const keys = timelineKeys(doc(3, 3, "cycle"));
  const tol = keyTolerance(30);

  it("finds the two poses a moment lies between and the eased blend", () => {
    assert.deepEqual(spanAt(keys, 1.5), { from: 1, to: 2, u: 0.5, eased: 0.5 });
    const early = spanAt(keys, 0.25);
    assert.equal(early.from, 0);
    assert.equal(early.to, 1);
    assert.equal(early.u, 0.25);
    assert.equal(early.eased, 0.15625);
    // Past the end it stays on the last span, fully blended.
    assert.deepEqual(spanAt(keys, 9), { from: 2, to: 3, u: 1, eased: 1 });
    assert.deepEqual(spanAt([], 1), { from: -1, to: -1, u: 0, eased: 0 });
  });

  it("knows the nearest key and whether a time is on one (half a frame)", () => {
    assert.equal(nearestKey(keys, 1.4), 1);
    assert.equal(nearestKey(keys, 1.5), 1, "a tie goes to the earlier key");
    assert.equal(nearestKey(keys, 2.9), 3);
    assert.equal(nearestKey([], 1), -1);
    assert.equal(keyAt(keys, 1.01, tol), 1);
    assert.equal(keyAt(keys, 1.05, tol), -1);
  });

  it("steps to the previous and next key", () => {
    assert.equal(adjacentKey(keys, 1, 1, tol), 2);
    assert.equal(adjacentKey(keys, 1, -1, tol), 0);
    assert.equal(adjacentKey(keys, 1.5, 1, tol), 2);
    assert.equal(adjacentKey(keys, 1.5, -1, tol), 1);
    assert.equal(adjacentKey(keys, 3, 1, tol), -1);
    assert.equal(adjacentKey(keys, 0, -1, tol), -1);
  });

  it("rests the playhead on the occurrence of the held pose it was put on", () => {
    const back = timelineKeys(doc(3, 4, "pingpong"));
    assert.equal(heldKeyTime(back, 1, null, tol), 1);
    assert.equal(heldKeyTime(back, 1, 3, tol), 3);
    assert.equal(heldKeyTime(back, 2, 3, tol), 2, "another pose's time falls back to the first occurrence");
  });

  it("snaps near a key and leaves other times alone", () => {
    assert.equal(snapToKey(keys, 1.04, 0.05), 1);
    assert.equal(snapToKey(keys, 1.2, 0.05), 1.2);
  });

  it("clamps and wraps times", () => {
    assert.equal(clampTime(-1, 3), 0);
    assert.equal(clampTime(5, 3), 3);
    assert.equal(clampTime(Number.NaN, 3), 0);
    assert.equal(wrapTime(7.5, 3), 1.5);
    assert.equal(wrapTime(-0.5, 3), 2.5);
    assert.equal(wrapTime(1, 0), 0);
  });
});

describe("ruler and words", () => {
  it("labels round steps far enough apart, with small ticks between", () => {
    const ticks = rulerTicks(4, 800);
    const majors = ticks.filter((t) => t.major).map((t) => t.t);
    assert.deepEqual(majors, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]);
    assert.ok(ticks.length > majors.length);
    const narrow = rulerTicks(4, 240).filter((t) => t.major).map((t) => t.t);
    assert.deepEqual(narrow, [0, 1, 2, 3, 4]);
    assert.deepEqual(rulerTicks(0, 400), []);
  });

  it("says where the playhead is", () => {
    const keys = timelineKeys(doc(3, 4, "pingpong"));
    const labels = ["start", "Bottom", ""];
    const tol = keyTolerance(30);
    assert.equal(describeTime(keys, 1, 4, labels, tol), "1.0 s of 4.0 s, pose 2 · Bottom");
    assert.equal(describeTime(keys, 2, 4, labels, tol), "2.0 s of 4.0 s, pose 3");
    assert.equal(describeTime(keys, 1.6, 4, labels, tol), "1.6 s of 4.0 s, between pose 2 and pose 3");
    assert.equal(describeTime([], 1.25, 4, null, tol), "1.3 s of 4.0 s");
    assert.equal(poseName(0, labels), "Pose 1 · start");
    assert.equal(poseName(2, labels), "Pose 3");
    assert.equal(formatSeconds(1.234, 2), "1.23 s");
  });
});
