import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as THREE from "three";
import { NEUTRAL_POSE, getPoseValue, setPoseValue, type PoseAngles } from "./anatomy.ts";
import { buildTemplate, templateFor, type TemplateExercise } from "./exercise-templates.ts";
import { buildRig, captureRestPose } from "./pose-clip.ts";
import { ANGLE_PATHS, poseFromBones } from "./pose-from-bones.ts";
import { bonesOf } from "./test-captures.ts";
import { crookedRig, mannequin } from "./test-rigs.ts";

const CATALOG = JSON.parse(readFileSync(new URL("./__fixtures__/catalog-exercises.json", import.meta.url), "utf8")) as (TemplateExercise & { exo_id: number })[];

/** One exercise per template: every template of the catalog. */
const PER_TEMPLATE = [...new Map(CATALOG.map((ex) => [templateFor(ex), ex])).entries()];

function rigOf(model: THREE.Object3D) {
  const rest = captureRestPose(model);
  return buildRig(model, rest);
}

const RIGS = [
  ["mannequin (T-pose, shoulder bones)", rigOf(mannequin())],
  ["Meshy-like rig (no shoulder bones, crooked rest)", rigOf(crookedRig().model)],
] as const;

/** Angles to bones to angles, on a rig. */
function roundTrip(rig: ReturnType<typeof rigOf>, pose: PoseAngles, previous?: PoseAngles) {
  const hips = rig.rest.get(rig.names.Hips!)!.position.clone();
  return poseFromBones(rig, bonesOf(pose, rig), hips, { previous });
}

/** The fields a rig can carry: without a shoulder bone nothing moves the shoulder blade. */
function comparable(rig: ReturnType<typeof rigOf>, pose: PoseAngles, path: string): boolean {
  if (path.includes("scapula")) return Boolean(rig.names[path.startsWith("left") ? "LeftShoulder" : "RightShoulder"]);
  // The plane an arm rises in means nothing while it hangs along the trunk.
  if (path.endsWith("shoulder_plane")) return (getPoseValue(pose, path.replace("plane", "elevation")) ?? 0) >= 1;
  return true;
}

describe("angles read back from the bones", () => {
  it("covers at least six exercise templates", () => {
    assert.ok(PER_TEMPLATE.length >= 6, `${PER_TEMPLATE.length} templates`);
  });

  for (const [name, rig] of RIGS) {
    it(`every key pose of every template comes back within 2 degrees per joint on the ${name}`, () => {
      const failures: string[] = [];
      let checked = 0;
      for (const [template, ex] of PER_TEMPLATE) {
        buildTemplate(ex).poses.forEach((pose, k) => {
          const back = roundTrip(rig, pose).pose;
          for (const path of ANGLE_PATHS) {
            if (!comparable(rig, pose, path)) continue;
            checked += 1;
            const want = getPoseValue(pose, path) ?? 0;
            const got = getPoseValue(back, path) ?? 0;
            if (Math.abs(got - want) > 2) failures.push(`${template} pose ${k + 1} ${path}: ${want} came back as ${got.toFixed(2)}`);
          }
        });
      }
      assert.ok(checked > 1000, `${checked} joint values checked`);
      assert.deepEqual(failures, []);
    });
  }

  it("says what it had to hold to the joint limits, and holds it there", () => {
    const [, rig] = RIGS[0];
    // characterDeltas does not clamp: bones bent past the elbow's range, as a bad capture would.
    const bent = setPoseValue(setPoseValue(NEUTRAL_POSE, "left_arm.elbow_flexion", 170), "right_leg.knee_flexion", 60);
    const { pose, clamped } = roundTrip(rig, bent);
    assert.equal(pose.left_arm.elbow_flexion, 150);
    assert.ok(Math.abs(pose.right_leg.knee_flexion - 60) < 0.5);
    assert.deepEqual(clamped, ["left_arm.elbow_flexion: 170 -> 150"]);
  });

  it("leaves the parts a capture does not move in the anatomical position, not in the rig's rest pose", () => {
    const [, rig] = RIGS[0];
    // The arms carry no data: their bones stay at rest, which on this rig is a T-pose.
    const raised = setPoseValue(NEUTRAL_POSE, "left_leg.hip_flexion", 40);
    const local = bonesOf(raised, rig);
    for (const n of ["LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand"] as const) local.delete(rig.names[n]!);
    const hips = rig.rest.get(rig.names.Hips!)!.position.clone();
    const { pose } = poseFromBones(rig, local, hips, { driven: (l) => !/Arm|Hand/.test(l) });
    assert.equal(pose.left_arm.shoulder_elevation, 0);
    assert.equal(pose.right_arm.elbow_flexion, 0);
    assert.ok(Math.abs(pose.left_leg.hip_flexion - 40) < 0.5);
  });

  it("keeps a turn about the forearm continuous past 90 degrees (a palm turned back)", () => {
    const [, rig] = RIGS[0];
    const pose = setPoseValue(setPoseValue(NEUTRAL_POSE, "left_arm.forearm_pronation", 160), "left_arm.elbow_flexion", 30);
    const back = roundTrip(rig, pose).pose;
    assert.ok(Math.abs(back.left_arm.forearm_pronation - 160) < 0.5, String(back.left_arm.forearm_pronation));
  });
});
