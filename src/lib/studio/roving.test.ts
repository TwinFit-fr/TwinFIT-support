import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rovingIndex } from "./roving.ts";

describe("arrow keys in a group of choices", () => {
  it("moves and wraps along the group's axis", () => {
    assert.equal(rovingIndex("ArrowRight", 0, 3), 1);
    assert.equal(rovingIndex("ArrowRight", 2, 3), 0);
    assert.equal(rovingIndex("ArrowLeft", 0, 3), 2);
    assert.equal(rovingIndex("ArrowDown", 1, 4, "vertical"), 2);
    assert.equal(rovingIndex("ArrowUp", 0, 4, "vertical"), 3);
  });

  it("jumps with Home and End and ignores other keys", () => {
    assert.equal(rovingIndex("Home", 2, 3), 0);
    assert.equal(rovingIndex("End", 0, 3), 2);
    assert.equal(rovingIndex("ArrowDown", 0, 3), null);
    assert.equal(rovingIndex("Enter", 0, 3), null);
    assert.equal(rovingIndex("ArrowRight", 0, 0), null);
  });
});
