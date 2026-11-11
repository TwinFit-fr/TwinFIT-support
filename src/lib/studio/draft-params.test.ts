import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { draftParams, fitParams, hasManualEdits, posesDistance } from "./draft-params.ts";
import { DEFAULT_PARAMS, buildTemplate, type TemplateExercise } from "./exercise-templates.ts";
import { templateDraft } from "./template-draft.ts";

const CATALOG = JSON.parse(readFileSync(new URL("./__fixtures__/catalog-exercises.json", import.meta.url), "utf8")) as TemplateExercise[];
const byName = (name: string) => CATALOG.find((ex) => ex.name === name)!;

describe("the settings a draft stands for", () => {
  it("are read from the meta when the draft says", () => {
    const squat = byName("Air Squat");
    const deep = templateDraft(squat, { ...DEFAULT_PARAMS, range: "deep" });
    assert.equal(draftParams(squat, deep).range, "deep");
  });

  it("are the nearest template's for a clip that does not say (an older save)", () => {
    const squat = byName("Air Squat");
    const built = buildTemplate(squat, { ...DEFAULT_PARAMS, range: "deep", stance: "wide", lean: "forward" });
    const poses = structuredClone(built.poses);
    poses[1].left_arm.elbow_flexion += 12;
    assert.deepEqual(fitParams(squat, poses), { ...DEFAULT_PARAMS, range: "deep", stance: "wide", lean: "forward" });
    assert.deepEqual(draftParams(squat, { poses, meta: { template: "squat" } }), { ...DEFAULT_PARAMS, range: "deep", stance: "wide", lean: "forward" });
  });

  it("read the tempo back from the timing when the template gives exactly that timing", () => {
    const squat = byName("Air Squat");
    const built = buildTemplate(squat, { ...DEFAULT_PARAMS, down_s: 3, up_s: 1.5 });
    assert.deepEqual(fitParams(squat, built.poses, built.weights), { ...DEFAULT_PARAMS, down_s: 3, up_s: 1.5 });
    assert.deepEqual(fitParams(squat, built.poses, [1, 7, 2]), DEFAULT_PARAMS);
  });

  it("go to the defaults on a tie (an exercise with nothing to choose)", () => {
    const curl = byName("Dumbbell Biceps Curl");
    assert.deepEqual(fitParams(curl, buildTemplate(curl, DEFAULT_PARAMS).poses), DEFAULT_PARAMS);
  });

  it("counts a missing pose heavily", () => {
    const squat = buildTemplate(byName("Air Squat"), DEFAULT_PARAMS).poses;
    assert.ok(posesDistance(squat, squat.slice(0, 1)) >= 1000);
    assert.equal(posesDistance(squat, structuredClone(squat)), 0);
  });
});

describe("manual edits", () => {
  it("are anything the template would not build for the draft's own settings", () => {
    const squat = byName("Air Squat");
    const deep = templateDraft(squat, { ...DEFAULT_PARAMS, range: "deep" });
    assert.equal(hasManualEdits(deep, squat), false);
    const moved = structuredClone(deep.poses);
    moved[1].left_arm.elbow_flexion += 10;
    assert.equal(hasManualEdits({ poses: moved, meta: deep.meta }, squat), true);
    assert.equal(hasManualEdits({ poses: deep.poses.slice(0, 1), meta: deep.meta }, squat), true);
    // Through JSON (a saved clip, the server's draft) the same poses still count as untouched.
    assert.equal(hasManualEdits(JSON.parse(JSON.stringify(deep)), squat), false);
  });

  it("are none for a clip saved from the template before its settings were stored", () => {
    const squat = byName("Air Squat");
    const built = buildTemplate(squat, { ...DEFAULT_PARAMS, stance: "wide" });
    assert.equal(hasManualEdits({ poses: JSON.parse(JSON.stringify(built.poses)), meta: {} }, squat), false);
  });
});
