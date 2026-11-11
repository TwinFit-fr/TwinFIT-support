import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DraftOrigin } from "./pose-origin.ts";
import { clipGuard, guardConsequence, guardDragQuestion, guardNotice, guardQuestion } from "./rebuild-guard.ts";

const clip: DraftOrigin = { kind: "clip", vectorId: "v12", seq: 12, from: "squat template" };
const template: DraftOrigin = { kind: "template", template: "squat" };

describe("rebuild guard for saved clips", () => {
  it("locks a saved clip whose poses a rebuild would replace (hand-tuned or edited)", () => {
    assert.deepEqual(clipGuard(clip, "clip", 3, []), { locked: true, vectorId: "v12", seq: 12, poses: 3 });
    assert.equal(clipGuard(clip, "edits", 3, []).locked, true);
  });

  it("does not lock a saved clip that is exactly what its settings build", () => {
    assert.equal(clipGuard(clip, null, 2, []).locked, false);
  });

  it("does not lock drafts that are not saved clips", () => {
    assert.equal(clipGuard(template, "edits", 2, []).locked, false);
    assert.equal(clipGuard({ kind: "ai", template: null, params: null, notes: null }, "draft", 3, []).locked, false);
  });

  it("stays open once the user agreed for that clip, and only for that clip", () => {
    assert.equal(clipGuard(clip, "clip", 3, ["v12"]).locked, false);
    assert.equal(clipGuard({ ...clip, vectorId: "v13", seq: 13 }, "clip", 3, ["v12"]).locked, true);
  });

  it("names what a rebuild replaces before it happens", () => {
    const g = clipGuard(clip, "clip", 3, []);
    assert.ok(g.locked);
    assert.match(guardNotice(g), /^Saved clip #12 .* its 3 poses stay as they are\.$/);
    assert.equal(guardQuestion("Range: deep"), "Rebuild every pose from the template with Range: deep?");
    assert.equal(guardQuestion(null), "Rebuild every pose from the template with these settings?");
    assert.match(guardConsequence(g), /replaces the 3 poses of saved clip #12/);
    assert.match(guardDragQuestion(g), /replacing the 3 poses of clip #12/);
    const one = clipGuard({ ...clip, seq: null }, "clip", 1, []);
    assert.ok(one.locked);
    assert.match(guardConsequence(one), /replaces the 1 pose of this saved clip /);
    assert.match(guardNotice(one), /^This saved clip has poses/);
  });
});
