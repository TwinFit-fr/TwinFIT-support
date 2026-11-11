import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_PARAMS, buildTemplate, type TemplateExercise } from "./exercise-templates.ts";
import { defaultDraft, hasTemplate, templateExerciseOf } from "./template-draft.ts";

const CATALOG = JSON.parse(readFileSync(new URL("./__fixtures__/catalog-exercises.json", import.meta.url), "utf8")) as (TemplateExercise & { exo_id: number })[];
const byName = (name: string) => CATALOG.find((ex) => ex.name === name)!;

describe("default template draft", () => {
  it("reads the catalog codes the sidebar carries", () => {
    const ex = templateExerciseOf({
      display_name: "Dumbbell Biceps Curl",
      movement_type: { code: "CURL" },
      position: { code: "UPRIGHT" },
      equipment: { code: "DUMBBELL" },
      support_equipment: null,
      grip: { code: "UNDERHAND" },
    });
    assert.deepEqual(ex, { name: "Dumbbell Biceps Curl", movement: "CURL", position: "UPRIGHT", equipment: "DUMBBELL", support: null, grip: "UNDERHAND" });
  });

  it("is the template with its default parameters, and the same every time", () => {
    const ex = byName("Dumbbell Biceps Curl");
    const a = defaultDraft(ex);
    const b = defaultDraft(ex);
    const built = buildTemplate(ex, DEFAULT_PARAMS);
    assert.deepEqual(a.poses, built.poses);
    assert.deepEqual(a, b);
    assert.deepEqual(a.origin, { kind: "template", template: built.id });
    assert.deepEqual(a.labels, built.labels);
    assert.equal(a.mode, built.mode);
    assert.equal(a.twoHanded, false);
  });

  it("carries the flags the body checks read, as the server's draft does", () => {
    const lunge = defaultDraft(byName(CATALOG.find((ex) => ex.movement === "LUNGE")!.name));
    const built = buildTemplate(CATALOG.find((ex) => ex.movement === "LUNGE")!, DEFAULT_PARAMS);
    assert.equal(lunge.meta.unilateral, built.unilateral);
    assert.equal(lunge.meta.airborne, built.airborne);
    assert.equal(lunge.meta.moving, built.moving);
    assert.deepEqual(lunge.meta.template_params, DEFAULT_PARAMS);
  });

  it("does not share pose objects with the template (editing one cannot change the next draft)", () => {
    const ex = byName("Dumbbell Biceps Curl");
    const a = defaultDraft(ex);
    a.poses[0].left_arm.elbow_flexion = 123;
    assert.notEqual(defaultDraft(ex).poses[0].left_arm.elbow_flexion, 123);
  });

  it("gives every exercise of the catalog a template draft", () => {
    const without = CATALOG.filter((ex) => defaultDraft(ex).origin.kind !== "template").map((ex) => ex.name);
    assert.deepEqual(without, []);
  });

  it("falls back to one neutral pose for an exercise without a template", () => {
    const ex: TemplateExercise = { name: "Mystery move", movement: null, position: null, equipment: null, support: null, grip: null };
    assert.equal(hasTemplate(ex), false);
    const d = defaultDraft(ex);
    assert.equal(d.poses.length, 1);
    assert.deepEqual(d.origin, { kind: "neutral", reason: "no-template" });
    assert.deepEqual(d.meta, {});
    assert.equal(hasTemplate({ ...ex, movement: "SOMETHING NEW" }), false);
    assert.equal(hasTemplate({ ...ex, name: "Resting", movement: "CARDIO" }), true);
  });
});
