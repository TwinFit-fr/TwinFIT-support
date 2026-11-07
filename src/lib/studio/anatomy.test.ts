import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEUTRAL_POSE, buildKeyframes, clampToLimit, limitOf, mirrorPath, poseClipFromDraft, posesFromClip, sanitizePose, setPoseValue } from "./anatomy.ts";

describe("buildKeyframes", () => {
  it("holds a single pose for the whole duration", () => {
    const keys = buildKeyframes([NEUTRAL_POSE], 2, "pingpong");
    assert.deepEqual(keys.map((k) => [k.t, k.position]), [[0, 0], [2, 0]]);
  });

  it("goes there and back for a boomerang and ends exactly at the duration", () => {
    const a = NEUTRAL_POSE;
    const b = setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", 90);
    const c = setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", 120);
    const keys = buildKeyframes([a, b, c], 4, "pingpong");
    assert.deepEqual(keys.map((k) => k.position), [0, 1, 2, 1, 0]);
    assert.equal(keys[0].t, 0);
    assert.equal(keys[keys.length - 1].t, 4);
    assert.ok(keys.every((k, i) => i === 0 || k.t > keys[i - 1].t));
  });

  it("closes a cycle on the first pose and spends more time on heavier segments", () => {
    const a = NEUTRAL_POSE;
    const b = setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", 90);
    const even = buildKeyframes([a, b], 2, "cycle");
    assert.deepEqual(even.map((k) => k.position), [0, 1, 0]);
    assert.ok(Math.abs(even[1].t - 1) < 1e-9);
    const slowIn = buildKeyframes([a, b], 2, "cycle", [1, 3]);
    assert.ok(slowIn[1].t > 1.4, "the way into pose 2 takes three quarters of the loop");
  });
});

describe("posesFromClip ⇄ poseClipFromDraft", () => {
  it("round-trips poses, loop mode and weights through the clip json", () => {
    const poses = [NEUTRAL_POSE, setPoseValue(NEUTRAL_POSE, "right_arm.elbow_flexion", 90), setPoseValue(NEUTRAL_POSE, "right_arm.elbow_flexion", 140)];
    const clip = poseClipFromDraft({ poses, mode: "pingpong", durationS: 3, fps: 30, twoHanded: false, grip: null, weights: [1, 2, 1], meta: {} });
    const back = posesFromClip(clip);
    assert.equal(back.poses.length, 3);
    assert.equal(back.mode, "pingpong");
    assert.deepEqual(back.weights, [1, 2, 1]);
    assert.equal(back.poses[2].right_arm.elbow_flexion, 140);
  });
});

describe("joint limits", () => {
  it("clamps a value into its joint's range", () => {
    const knee = limitOf("left_leg.knee_flexion");
    assert.equal(clampToLimit("left_leg.knee_flexion", knee.max + 50), knee.max);
    assert.equal(clampToLimit("left_leg.knee_flexion", knee.min - 50), knee.min);
  });

  it("sanitizePose keeps every joint inside its range", () => {
    const wild = setPoseValue(setPoseValue(NEUTRAL_POSE, "left_arm.elbow_flexion", 999), "hips.pitch", -999);
    const clean = sanitizePose(wild);
    assert.equal(clean.left_arm.elbow_flexion, limitOf("left_arm.elbow_flexion").max);
    assert.equal(clean.hips.pitch, limitOf("hips.pitch").min);
  });

  it("mirrors a side path and leaves central ones alone", () => {
    assert.equal(mirrorPath("left_arm.shoulder_abduction"), "right_arm.shoulder_abduction");
    assert.equal(mirrorPath("right_leg.knee_flexion"), "left_leg.knee_flexion");
    assert.equal(mirrorPath("hips.pitch"), null);
  });
});
