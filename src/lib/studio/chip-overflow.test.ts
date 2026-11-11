import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fitChips } from "./chip-overflow.ts";

const row = (available: number, pinned: number | null = null) => fitChips({ widths: [36, 84, 60, 62, 64, 52], available, gap: 6, moreWidth: 44, pinned });

describe("chips that fit a one-line row", () => {
  it("shows every chip when the row has room, without a 'more' control", () => {
    assert.deepEqual(row(388), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(fitChips({ widths: [], available: 100, gap: 6, moreWidth: 44 }), []);
  });

  it("leaves out whole chips from the end and keeps room for 'more'", () => {
    // 36 + 84 + 60 + 3 gaps + 44 = 242 fits in 250; the next chip (62 + 6) does not.
    assert.deepEqual(row(250), [0, 1, 2]);
    assert.deepEqual(row(387), [0, 1, 2, 3, 4]);
  });

  it("never needs more than the row for what it shows", () => {
    const widths = [36, 84, 60, 62, 64, 52];
    for (let available = 140; available < 400; available++) {
      const shown = row(available);
      if (shown.length === widths.length) continue;
      const used = shown.reduce((sum, index) => sum + widths[index] + 6, 0) + 44;
      assert.ok(used <= available, `overflows at ${available}`);
    }
  });

  it("keeps the selected chip in view, in its place in the order", () => {
    assert.deepEqual(row(250, 5), [0, 1, 5]);
    assert.deepEqual(row(250, 1), [0, 1, 2]);
  });

  it("always shows the first chip, however narrow the row", () => {
    assert.deepEqual(row(40), [0]);
    assert.deepEqual(row(40, 4), [0, 4]);
  });
});
