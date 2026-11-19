import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeByPosition, isSequencePublished, reviewCounts, sequenceState } from "./publication.ts";
import { frame, live } from "./test-images.ts";

function sequence() {
  const start = live(0, undefined, { id: "s" });
  const mid = live(1, "s", { id: "m" });
  const end = live(2, "s", { id: "e" });
  return { start, mid, end };
}

describe("isSequencePublished", () => {
  it("is published when every frame is active, approved and drawn on the active Start", () => {
    const { start, mid, end } = sequence();
    assert.equal(isSequencePublished([start, mid, end], false), true);
  });

  it("needs a Mid only for three-frame exercises", () => {
    const { start, end } = sequence();
    assert.equal(isSequencePublished([start, end], true), true);
    assert.equal(isSequencePublished([start, end], false), false);
  });

  it("is not published while a frame is pending", () => {
    const { start, mid, end } = sequence();
    assert.equal(isSequencePublished([start, { ...mid, review_status: "pending" }, end], false), false);
    assert.equal(isSequencePublished([{ ...start, review_status: "pending" }, mid, end], false), false);
  });

  it("is not published when a Mid / End was drawn on another Start, or on none", () => {
    const { start, mid, end } = sequence();
    assert.equal(isSequencePublished([start, { ...mid, start_drawing_id: "other" }, end], false), false);
    assert.equal(isSequencePublished([start, mid, { ...end, start_drawing_id: null }], false), false);
  });

  it("follows a frame-align copy of the Start: it keeps the drawing of its source", () => {
    const { mid, end } = sequence();
    const aligned = live(0, undefined, { id: "s-aligned", drawing_id: "s" });
    assert.equal(isSequencePublished([aligned, mid, end], false), true);
  });

  it("ignores inactive frames", () => {
    const { start, mid, end } = sequence();
    const candidate = frame({ target: 2, review_status: "approved" });
    assert.equal(isSequencePublished([start, mid, candidate], false), false);
    assert.equal(isSequencePublished([start, mid, end, candidate], false), true);
  });
});

describe("sequenceState", () => {
  it("tells empty, published and unpublished apart", () => {
    const { start, mid, end } = sequence();
    assert.equal(sequenceState([frame()], false), "empty");
    assert.equal(sequenceState([start, mid, end], false), "published");
    assert.equal(sequenceState([start, mid], false), "unpublished");
  });
});

describe("activeByPosition and reviewCounts", () => {
  it("maps active frames by position", () => {
    const { start, end } = sequence();
    const map = activeByPosition([start, end, frame()]);
    assert.deepEqual([...map.keys()], [0, 2]);
  });

  it("counts frames per review status", () => {
    const counts = reviewCounts([
      frame(),
      frame(),
      frame({ review_status: "approved" }),
      frame({ review_status: "rejected" }),
    ]);
    assert.deepEqual(counts, { pending: 2, approved: 1, rejected: 1 });
  });
});
