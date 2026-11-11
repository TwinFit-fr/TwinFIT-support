import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_PARAMS, buildTemplate, type TemplateExercise } from "./exercise-templates.ts";
import { templateDraft } from "./template-draft.ts";
import { normalizeParams, optionOf, paramsFromMeta, settingChange, settingsFor, settingsSummary, tempoMatters } from "./template-settings.ts";

const CATALOG = JSON.parse(readFileSync(new URL("./__fixtures__/catalog-exercises.json", import.meta.url), "utf8")) as TemplateExercise[];
const byName = (name: string) => CATALOG.find((ex) => ex.name === name)!;
const keys = (ex: TemplateExercise) => settingsFor(ex).map((s) => s.key);

describe("template settings shown for an exercise", () => {
  it("lists only the settings that change the poses of that template", () => {
    assert.deepEqual(keys(byName("Air Squat")), ["range", "stance", "lean"]);
    assert.deepEqual(keys(byName("Bench Press")), ["grip"]);
    assert.deepEqual(keys(byName("Dumbbell Biceps Curl")), []);
    // A sumo squat has its own wide stance and depth: nothing to choose there.
    assert.deepEqual(keys(byName("Sumo Squat")), []);
  });

  it("offers only the choices that build different poses, under the clearest name", () => {
    const side = settingsFor(byName("Bulgarian Split Squat")).find((s) => s.key === "side")!;
    assert.deepEqual(side.options.map((o) => o.value), ["left", "right"]);
    // The draft's default "both" is the left leg working: its button shows as chosen.
    assert.equal(optionOf(side, "both")?.value, "left");
    const grip = settingsFor(byName("Push-Up")).find((s) => s.key === "grip")!;
    assert.deepEqual(grip.options.map((o) => o.value), ["shoulder", "wide"]);
  });

  it("every option of every exercise builds different poses than its neighbours", () => {
    for (const ex of CATALOG) {
      for (const setting of settingsFor(ex)) {
        const built = setting.options.map((o) => JSON.stringify(buildTemplate(ex, { ...DEFAULT_PARAMS, [setting.key]: o.value }).poses));
        assert.equal(new Set(built).size, built.length, `${ex.name} ${setting.key}`);
      }
    }
  });

  it("knows when the tempo changes the timing", () => {
    assert.equal(tempoMatters(byName("Air Squat")), true);
    // A loop at an even pace (left knee, right knee) has no lowering or lifting phase.
    assert.equal(tempoMatters(byName("High Knees")), false);
  });
});

describe("settings of a draft", () => {
  it("reads them from the meta, falling back to the defaults for anything missing or invalid", () => {
    assert.deepEqual(paramsFromMeta({}), DEFAULT_PARAMS);
    assert.deepEqual(paramsFromMeta({ template_params: { range: "deep", stance: "huge", down_s: 99 } }), { ...DEFAULT_PARAMS, range: "deep", down_s: 6 });
    assert.deepEqual(paramsFromMeta(null), DEFAULT_PARAMS);
  });

  it("sets what the template ignores back to the default", () => {
    const curl = byName("Dumbbell Biceps Curl");
    assert.deepEqual(normalizeParams(curl, { ...DEFAULT_PARAMS, lean: "forward", stance: "wide", down_s: 3 }), { ...DEFAULT_PARAMS, down_s: 3 });
    const squat = byName("Air Squat");
    assert.deepEqual(normalizeParams(squat, { ...DEFAULT_PARAMS, range: "deep", grip: "wide" }), { ...DEFAULT_PARAMS, range: "deep" });
  });
});

describe("settings in words", () => {
  it("names what differs from the defaults, tempo included", () => {
    assert.equal(settingsSummary(DEFAULT_PARAMS), "default settings");
    assert.equal(settingsSummary({ ...DEFAULT_PARAMS, range: "deep", stance: "wide" }), "deep range, wide stance");
    assert.equal(settingsSummary({ ...DEFAULT_PARAMS, down_s: 3 }), "3 s down");
    assert.equal(settingsSummary(null), "default settings");
  });

  it("says what a change did, for the stage", () => {
    assert.equal(settingChange(DEFAULT_PARAMS, { ...DEFAULT_PARAMS, range: "deep" }), "Range: deep");
    assert.equal(settingChange(DEFAULT_PARAMS, { ...DEFAULT_PARAMS, stance: "wide", up_s: 1.5 }), "Stance: wide, Tempo: 2 s down, 1.5 s up");
    assert.equal(settingChange(DEFAULT_PARAMS, DEFAULT_PARAMS), null);
  });
});

describe("rebuilding the draft from settings", () => {
  it("rebuilds every pose, the timing and the origin from the template", () => {
    const squat = byName("Air Squat");
    const draft = templateDraft(squat, { ...DEFAULT_PARAMS, range: "deep", stance: "wide", down_s: 3 });
    const built = buildTemplate(squat, { ...DEFAULT_PARAMS, range: "deep", stance: "wide", down_s: 3 });
    assert.deepEqual(draft.poses, built.poses);
    assert.deepEqual(draft.weights, built.weights);
    assert.deepEqual(draft.origin, { kind: "template", template: "squat", params: { ...DEFAULT_PARAMS, range: "deep", stance: "wide", down_s: 3 } });
    assert.deepEqual(draft.meta.template_params, { ...DEFAULT_PARAMS, range: "deep", stance: "wide", down_s: 3 });
  });

  it("keeps the feet on the floor and the squat inside its range of motion at every setting", () => {
    const squat = byName("Air Squat");
    for (const range of ["partial", "full", "deep"] as const) {
      for (const lean of ["upright", "moderate", "forward"] as const) {
        const bottom = templateDraft(squat, { ...DEFAULT_PARAMS, range, lean }).poses[1];
        assert.notEqual(bottom.feet_flat, false);
        assert.ok(bottom.hips.pitch >= 10 && bottom.hips.pitch <= 50, `${range} ${lean}: ${bottom.hips.pitch}`);
      }
    }
  });
});
