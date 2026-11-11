import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DraftOrigin } from "./pose-origin.ts";
import { effectiveDragMode, rebuildToast, rebuildWarning, replacedBy, replacesNote } from "./rebuild-words.ts";

const clip: DraftOrigin = { kind: "clip", vectorId: "v", seq: 23, from: null };
const template: DraftOrigin = { kind: "template", template: "squat" };
const ai: DraftOrigin = { kind: "ai", template: null, params: null, notes: null };

describe("what a rebuild from the template replaces", () => {
  it("nothing when the poses are the template's own", () => {
    assert.equal(replacedBy(clip, false, false), null);
    assert.equal(replacedBy(template, true, false), null);
  });

  it("edits made by hand, a saved clip's poses, or a draft's", () => {
    assert.equal(replacedBy(template, true, true), "edits");
    assert.equal(replacedBy(clip, true, true), "edits");
    assert.equal(replacedBy(clip, false, true), "clip");
    assert.equal(replacedBy(ai, false, true), "draft");
  });

  it("is said plainly before, during and after", () => {
    assert.match(rebuildWarning("edits")!, /manual edits.*replaces them; Ctrl\+Z brings them back/);
    assert.match(rebuildWarning("clip")!, /saved clip.*Ctrl\+Z brings the clip back/);
    assert.equal(rebuildWarning(null), null);
    assert.equal(replacesNote("clip"), "replaces the saved clip");
    assert.equal(replacesNote("edits"), "replaces your edits");
    assert.equal(replacesNote(null), null);
    assert.equal(rebuildToast("edits", "Stance: wide"), "Stance: wide. Every pose was rebuilt from the template and your manual edits were replaced.");
    assert.equal(rebuildToast(null, "Stance: wide"), null);
  });
});

describe("the drag mode in force", () => {
  it("is Exercise for a template draft or a saved clip opened as it was, Limb after edits by hand", () => {
    assert.equal(effectiveDragMode(null, true, null), "exercise");
    assert.equal(effectiveDragMode(null, true, "clip"), "exercise");
    assert.equal(effectiveDragMode(null, true, "edits"), "limb");
  });

  it("follows the user's choice, and is Limb when there is no setting to drag", () => {
    assert.equal(effectiveDragMode("limb", true, null), "limb");
    assert.equal(effectiveDragMode("exercise", true, "edits"), "exercise");
    assert.equal(effectiveDragMode("exercise", false, null), "limb");
  });
});
