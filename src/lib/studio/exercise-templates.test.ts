import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { POSE_CLIP_VERSION, buildKeyframes, type PoseClipJson } from "./anatomy.ts";
import { DEFAULT_PARAMS, RANGES, STANCES, buildTemplate, templateFor, type TemplateExercise, type TemplateParams } from "./exercise-templates.ts";
import { captureRestPose } from "./pose-clip.ts";
import { validatePoseClip } from "./pose-validate.ts";
import { crookedRig, mannequin } from "./test-rigs.ts";

/** Every active exercise of the catalog, as the worker reads it (exo_id, name, movement, position, equipment, support, grip). */
const CATALOG = JSON.parse(readFileSync(new URL("./__fixtures__/catalog-exercises.json", import.meta.url), "utf8")) as (TemplateExercise & { exo_id: number })[];

function clipOf(ex: TemplateExercise, params: Partial<TemplateParams> = {}): PoseClipJson {
  const t = buildTemplate(ex, params);
  return {
    kind: "pose-angles",
    version: POSE_CLIP_VERSION,
    fps: 30,
    duration: 4,
    loop: true,
    keyframes: buildKeyframes(t.poses, 4, t.mode, t.weights),
    meta: { unilateral: t.unilateral, airborne: t.airborne, moving: t.moving },
  };
}

describe("every exercise of the catalog", () => {
  it("has its own template, none falling through to standing still", () => {
    const resting = CATALOG.filter((ex) => templateFor(ex) === "resting" && ex.name !== "Resting");
    assert.deepEqual(resting.map((ex) => ex.name), []);
  });

  for (const [name, model] of [["mannequin", mannequin()], ["Meshy-like rig", crookedRig().model]] as const) {
    it(`holds up as a body on the ${name}`, () => {
      const rest = captureRestPose(model);
      const failures = CATALOG.flatMap((ex) => {
        const v = validatePoseClip(model, clipOf(ex), rest);
        return v.ok ? [] : [`#${ex.exo_id} ${ex.name}: ${v.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`];
      });
      assert.deepEqual(failures, []);
    });

    it(`stays valid across what the model may choose on the ${name}`, () => {
      const rest = captureRestPose(model);
      const legsDriven = CATALOG.filter((ex) => ["SQUAT", "DEADLIFT", "CALF RAISE"].includes(ex.movement ?? ""));
      const failures: string[] = [];
      for (const range of RANGES) {
        for (const stance of STANCES) {
          for (const ex of legsDriven) {
            const v = validatePoseClip(model, clipOf(ex, { range, stance }), rest);
            if (!v.ok) failures.push(`#${ex.exo_id} ${ex.name} ${range}/${stance}: ${v.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`);
          }
        }
      }
      assert.deepEqual(failures, []);
    });
  }
});

describe("templates", () => {
  const squat = CATALOG.find((ex) => ex.name === "Air Squat")!;

  it("are deterministic", () => {
    assert.deepEqual(buildTemplate(squat), buildTemplate(squat));
  });

  it("honour the depth asked for", () => {
    const knee = (range: TemplateParams["range"]) => buildTemplate(squat, { ...DEFAULT_PARAMS, range }).poses[1].left_leg.knee_flexion;
    assert.ok(knee("partial") < knee("full") && knee("full") < knee("deep"));
  });

  it("read the grip from the catalog", () => {
    const hammer = buildTemplate(CATALOG.find((ex) => ex.name === "Hammer Biceps Curl")!);
    const supinated = buildTemplate(CATALOG.find((ex) => ex.name === "Barbell Biceps Curl")!);
    assert.equal(hammer.poses[1].left_arm.forearm_pronation, 90);
    assert.equal(supinated.poses[1].left_arm.forearm_pronation, 0);
  });
});
