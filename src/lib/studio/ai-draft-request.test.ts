import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiFate, elapsedLabel, sameDraft, type AiRequest } from "./ai-draft-request.ts";

const request: AiRequest = { id: 3, exerciseId: "squat", avatarId: "a1", editId: 7, instructions: "deeper", startedAt: 1000 };
const here = { exerciseId: "squat", avatarId: "a1", editId: 7 };

describe("where an AI draft answer lands", () => {
  it("is applied on the draft it was asked for when nothing there was made by hand", () => {
    assert.equal(aiFate(request, 3, here, false), "apply");
  });

  it("waits as a suggestion when the draft holds work made by hand (before or during the wait)", () => {
    assert.equal(aiFate(request, 3, here, true), "suggest");
  });

  it("is discarded after the user switched exercise, avatar or opened another draft", () => {
    assert.equal(aiFate(request, 3, { ...here, exerciseId: "curl" }, false), "discard");
    assert.equal(aiFate(request, 3, { ...here, avatarId: "a2" }, true), "discard");
    assert.equal(aiFate(request, 3, { ...here, editId: 8 }, false), "discard");
    assert.equal(aiFate(request, 3, null, false), "discard");
  });

  it("is discarded when it was cancelled or a newer request replaced it", () => {
    assert.equal(aiFate(request, null, here, false), "discard");
    assert.equal(aiFate(request, 4, here, false), "discard");
  });

  it("compares drafts by exercise, avatar and edit identity", () => {
    assert.equal(sameDraft(request, here), true);
    assert.equal(sameDraft(request, null), false);
    assert.equal(sameDraft(null, here), false);
  });

  it("counts whole seconds while it runs", () => {
    assert.equal(elapsedLabel(1000, 1000), "0 s");
    assert.equal(elapsedLabel(1000, 9999), "8 s");
    assert.equal(elapsedLabel(1000, 500), "0 s");
  });
});
