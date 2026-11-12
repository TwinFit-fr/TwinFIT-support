import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { lerpPose } from "./anatomy.ts";
import { buildTemplate, type TemplateExercise } from "./exercise-templates.ts";
import { nameKeyPoses } from "./key-pose-names.ts";
import { buildRig, captureRestPose } from "./pose-clip.ts";
import { mannequin } from "./test-rigs.ts";

const CATALOG = JSON.parse(readFileSync(new URL("./__fixtures__/catalog-exercises.json", import.meta.url), "utf8")) as (TemplateExercise & { exo_id: number })[];
const byName = (name: string) => CATALOG.find((ex) => ex.name === name)!;
const model = mannequin();
const rig = buildRig(model, captureRestPose(model));

describe("names of key poses read from a capture", () => {
  it("takes the template's names for the key poses that look like its poses", () => {
    const t = buildTemplate(byName("Barbell Squat"));
    assert.ok(t.labels && t.labels.length >= 2);
    const names = nameKeyPoses({ poses: t.poses, frames: [0, 60], rig, reference: { poses: t.poses, labels: t.labels } });
    assert.deepEqual(names, t.labels);
  });

  it("names a key pose in between after the pose it moves toward, and uses each name once", () => {
    const t = buildTemplate(byName("Barbell Squat"));
    const [up, down] = t.poses;
    const poses = [up, lerpPose(up, down, 0.5), down, lerpPose(down, up, 0.5)];
    const names = nameKeyPoses({ poses, frames: [0, 30, 60, 90], rig, reference: { poses: t.poses, labels: t.labels } });
    assert.equal(names[0], t.labels![0]);
    assert.equal(names[2], t.labels![1]);
    assert.equal(names[1], `toward ${t.labels![1]}`);
    assert.equal(names[3], `toward ${t.labels![0]}`);
  });

  it("falls back to the frame when the exercise has no template names", () => {
    const t = buildTemplate(byName("Barbell Squat"));
    assert.deepEqual(nameKeyPoses({ poses: t.poses, frames: [0, 80], rig, reference: null }), ["start", "frame 80"]);
  });
});
