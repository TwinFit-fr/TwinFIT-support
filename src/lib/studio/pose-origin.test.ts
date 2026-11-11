import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PARAMS } from "./exercise-templates.ts";
import { clipFrom, editingStatus, originLabel, paramSummary, savedFrom } from "./pose-origin.ts";

describe("origin label", () => {
  it("names the template and its default settings", () => {
    assert.equal(originLabel({ kind: "template", template: "romanian_deadlift" }, false).text, "Template: romanian deadlift, default settings");
  });

  it("keeps the base origin after a manual change", () => {
    const label = originLabel({ kind: "template", template: "curl" }, true);
    assert.equal(label.base, "Template: curl");
    assert.equal(label.edited, true);
    assert.equal(label.text, "Template: curl, default settings · Edited by you");
  });

  it("says what the model chose for an AI draft, only where it differs from the defaults", () => {
    const label = originLabel({ kind: "ai", template: "squat", params: { ...DEFAULT_PARAMS, range: "deep", stance: "wide" }, notes: null }, false, DEFAULT_PARAMS);
    assert.equal(label.text, "AI draft, squat template, deep range, wide stance");
    assert.equal(originLabel({ kind: "ai", template: "squat", params: { ...DEFAULT_PARAMS }, notes: null }, false, DEFAULT_PARAMS).detail, "squat template, default settings");
    assert.equal(originLabel({ kind: "ai", template: null, params: null, notes: null }, false).detail, "angles written by the model");
  });

  it("names a saved clip by its number", () => {
    assert.equal(originLabel({ kind: "clip", vectorId: "v", seq: 47, from: null }, false).text, "Saved clip #47");
    assert.equal(originLabel({ kind: "clip", vectorId: "v", seq: 47, from: "squat template" }, true).text, "Saved clip #47, squat template · Edited by you");
  });

  it("keeps how a clip was made on its label after saving", () => {
    assert.equal(savedFrom({ kind: "template", template: "curl" }, true), "curl template, edited");
    assert.equal(savedFrom({ kind: "template", template: "curl" }, false), "curl template");
    assert.equal(savedFrom({ kind: "ai", template: "squat", params: null, notes: null }, false), "AI draft of the squat template");
    assert.equal(savedFrom({ kind: "clip", vectorId: "v", seq: 12, from: "deadlift template" }, true), "edited from #12");
    assert.equal(savedFrom({ kind: "clip", vectorId: "v", seq: 12, from: "deadlift template" }, false), "deadlift template");
    assert.equal(savedFrom({ kind: "neutral", reason: "scratch" }, true), "posed by hand");
    assert.equal(clipFrom({ template: "romanian_deadlift" }), "romanian deadlift template");
    assert.equal(clipFrom({ generator: "pose-editor" }), null);
    assert.equal(clipFrom(undefined), null);
  });

  it("says why an exercise starts from a neutral pose", () => {
    assert.equal(originLabel({ kind: "neutral", reason: "no-template" }, false).text, "Neutral pose, no template yet");
    assert.equal(originLabel({ kind: "neutral", reason: "scratch" }, false).text, "Neutral pose");
  });

  it("names the settings that differ from the defaults, tempo included", () => {
    assert.equal(paramSummary({ down_s: 3, up_s: 1 }, DEFAULT_PARAMS), "3 s down");
    assert.equal(paramSummary({ down_s: 2, up_s: 1 }, DEFAULT_PARAMS), "default settings");
    assert.equal(paramSummary({ side: "left" }, DEFAULT_PARAMS), "left side");
  });
});

describe("stage status while editing", () => {
  it("never says no clip is selected while poses are on the stage", () => {
    assert.equal(editingStatus({ vectorId: null, sourceSeq: null, dirty: false }), "Editing poses · unsaved draft");
    assert.equal(editingStatus({ vectorId: "v", sourceSeq: 47, dirty: true }), "Editing #47 · unsaved changes");
    assert.equal(editingStatus({ vectorId: "v", sourceSeq: 47, dirty: false }), "Editing #47 · saved");
  });
});
