import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEUTRAL_POSE, limitOf, setPoseValue } from "./anatomy.ts";
import {
  ALL_JOINT_PATHS,
  allJointGroups,
  formatEntry,
  formatValue,
  isUnusual,
  jointBones,
  jointEnds,
  jointName,
  mirrorNote,
  parseEntry,
  pointJoints,
  rangeMarks,
  shownValue,
  stepEntry,
} from "./joint-props.ts";
import { POINT_IDS } from "./pose-points.ts";

const paths = (point: Parameters<typeof pointJoints>[0], twoHanded = false) => pointJoints(point, { twoHanded }).flatMap((s) => s.paths);

describe("joints of a selected point", () => {
  it("shows the left hand's shoulder, elbow, forearm and wrist, and nothing else", () => {
    const p = paths("left_hand");
    assert.deepEqual(p, [
      "left_arm.shoulder_plane",
      "left_arm.shoulder_elevation",
      "left_arm.shoulder_rotation",
      "left_arm.elbow_flexion",
      "left_arm.forearm_pronation",
      "left_arm.wrist_flexion",
      "left_arm.wrist_deviation",
    ]);
    assert.deepEqual(pointJoints("left_hand").map((s) => s.title), ["Shoulder", "Elbow", "Forearm", "Wrist"]);
  });

  it("keeps every point to its own side and part of the body", () => {
    for (const id of POINT_IDS) {
      for (const path of paths(id)) {
        if (id.startsWith("left_")) assert.ok(path.startsWith("left_"), `${id} shows ${path}`);
        if (id.startsWith("right_")) assert.ok(path.startsWith("right_"), `${id} shows ${path}`);
        if (/_(hand|elbow)$/.test(id)) assert.ok(path.includes("_arm."), `${id} shows ${path}`);
        if (/_(foot|knee)$/.test(id)) assert.ok(path.includes("_leg."), `${id} shows ${path}`);
      }
    }
    assert.deepEqual(paths("head"), ["head.pitch", "head.yaw", "head.lateral"]);
    assert.ok(paths("hips").includes("hips.height_m"));
    assert.ok(paths("chest").every((p) => p.startsWith("lumbar.") || p.startsWith("thoracic.")));
    assert.deepEqual(paths("right_knee"), ["right_leg.hip_flexion", "right_leg.hip_abduction", "right_leg.hip_rotation", "right_leg.knee_flexion"]);
    assert.ok(paths("left_foot").includes("left_leg.ankle_dorsiflexion"));
  });

  it("adds the bar to the hands only when both hands hold one", () => {
    assert.ok(!paths("right_hand").some((p) => p.startsWith("implement.")));
    assert.deepEqual(paths("right_hand", true).filter((p) => p.startsWith("implement.")), ["implement.height_m", "implement.forward_m", "implement.grip_width_m"]);
    assert.ok(!paths("left_foot", true).some((p) => p.startsWith("implement.")));
  });

  it("reaches every field of the pose through the points and through All joints", () => {
    const viaPoints = new Set(POINT_IDS.flatMap((id) => paths(id, true)));
    const viaList = new Set(allJointGroups({ twoHanded: true }).flatMap((g) => g.paths));
    for (const path of ALL_JOINT_PATHS) {
      assert.ok(viaPoints.has(path), `${path} has no point`);
      assert.ok(viaList.has(path), `${path} is not in All joints`);
    }
    assert.equal(ALL_JOINT_PATHS.length, 47);
    assert.ok(!allJointGroups().some((g) => g.id === "implement"));
  });
});

describe("control names", () => {
  it("gives every control a unique plain name that carries its side", () => {
    const names = ALL_JOINT_PATHS.map(jointName);
    assert.equal(new Set(names).size, names.length);
    for (const path of ALL_JOINT_PATHS) {
      const name = jointName(path);
      assert.notEqual(name, path, `${path} has no name`);
      assert.ok(!/[()]/.test(name), `${name} carries a convention in brackets`);
      if (path.startsWith("left_")) assert.match(name, /^Left /);
      if (path.startsWith("right_")) assert.match(name, /^Right /);
      const [lo, hi] = jointEnds(path);
      assert.ok(lo && hi, `${path} has no words for its ends`);
    }
    assert.equal(jointName("left_arm.elbow_flexion"), "Left elbow flexion");
    assert.equal(jointName("right_leg.knee_flexion"), "Right knee flexion");
    assert.equal(jointName("hips.height_m"), "Pelvis height");
  });
});

describe("range marks", () => {
  it("puts the hard limits at the ends and the training range on the track", () => {
    const m = rangeMarks("left_arm.elbow_flexion");
    assert.equal(m.min, -5);
    assert.equal(m.max, 150);
    assert.equal(m.unit, "°");
    assert.ok(m.band);
    assert.equal(m.band.lo, 0);
    assert.equal(m.band.hi, 145);
    assert.ok(Math.abs(m.band.from - 5 / 155) < 1e-9);
    assert.ok(Math.abs(m.band.to - 150 / 155) < 1e-9);
    assert.ok(m.zero !== null && Math.abs(m.zero - 5 / 155) < 1e-9);
  });

  it("has no training band where no anatomy applies, and metres step by the centimetre", () => {
    const m = rangeMarks("hips.height_m");
    assert.equal(m.band, null);
    assert.equal(m.unit, "m");
    assert.equal(m.step, 0.01);
    assert.deepEqual([m.min, m.max], [limitOf("hips.height_m").min, limitOf("hips.height_m").max]);
    assert.equal(m.zero, null);
  });

  it("flags a value outside the usual training range", () => {
    assert.equal(isUnusual("left_leg.knee_flexion", 90), false);
    assert.equal(isUnusual("left_leg.knee_flexion", 140), false);
    assert.equal(isUnusual("left_leg.knee_flexion", 143), true);
    assert.equal(isUnusual("lumbar.flexion", 40), true);
    assert.equal(isUnusual("hips.height_m", 2), false);
  });
});

describe("numeric entry", () => {
  it("keeps an empty or half-typed field as nothing, never zero", () => {
    for (const text of ["", "  ", "-", ".", "-.", "−"]) assert.deepEqual(parseEntry(text), { kind: "empty" }, JSON.stringify(text));
  });

  it("accepts decimals, a comma and a typographic minus", () => {
    assert.deepEqual(parseEntry("12.5"), { kind: "ok", value: 12.5, clamped: false });
    assert.deepEqual(parseEntry("0,93", { min: 0.05, max: 2.2 }), { kind: "ok", value: 0.93, clamped: false });
    assert.deepEqual(parseEntry("−4"), { kind: "ok", value: -4, clamped: false });
    assert.deepEqual(parseEntry(".5"), { kind: "ok", value: 0.5, clamped: false });
    assert.deepEqual(parseEntry("12abc"), { kind: "invalid" });
    assert.deepEqual(parseEntry("1.2.3"), { kind: "invalid" });
  });

  it("keeps the value inside the limits and says so", () => {
    assert.deepEqual(parseEntry("170", { min: -5, max: 150 }), { kind: "ok", value: 150, clamped: true });
    assert.deepEqual(parseEntry("-20", { min: -5, max: 150 }), { kind: "ok", value: -5, clamped: true });
  });

  it("formats without jumping: tenths of a degree, centimetres", () => {
    assert.equal(formatEntry(12.5, "°"), "12.5");
    assert.equal(formatEntry(45, "°"), "45");
    assert.equal(formatEntry(-0.01, "°"), "0");
    assert.equal(formatEntry(0.9234, "m"), "0.92");
    assert.equal(formatValue(-5, "°"), "−5°");
    assert.equal(formatValue(0.9, "m"), "0.90 m");
  });

  it("steps with the arrow keys inside the limits, ten times with Shift", () => {
    assert.equal(stepEntry(0.91, 1, { step: 0.01, min: 0.05, max: 2.2 }), 0.92);
    assert.equal(stepEntry(148, 1, { step: 1, min: -5, max: 150, coarse: true }), 150);
    assert.equal(stepEntry(10, -1, { step: 1, min: -5, max: 150, coarse: true }), 0);
  });
});

describe("stage link and mirror", () => {
  it("names the skeleton joint each control turns", () => {
    assert.deepEqual(jointBones("left_arm.elbow_flexion"), ["LeftForeArm"]);
    assert.deepEqual(jointBones("right_arm.shoulder_plane"), ["RightArm"]);
    assert.deepEqual(jointBones("left_arm.forearm_pronation"), ["LeftForeArm", "LeftHand"]);
    assert.deepEqual(jointBones("right_leg.ankle_inversion"), ["RightFoot"]);
    assert.deepEqual(jointBones("hips.height_m"), ["Hips"]);
    for (const path of ALL_JOINT_PATHS) assert.ok(jointBones(path).length > 0, path);
  });

  it("says what Mirror will copy from this point", () => {
    assert.equal(mirrorNote("left_hand", { mirror: true, standing: true }), "Mirror on: a change here is copied to the right arm.");
    assert.equal(mirrorNote("right_knee", { mirror: false, standing: true }), "Mirror off: only the right leg changes.");
    assert.match(mirrorNote("left_foot", { mirror: true, standing: true }), /copied to the right leg\. On the stage, a standing leg is still dragged alone\./);
    assert.match(mirrorNote("head", { mirror: true, standing: true }), /does not apply/);
  });
});

describe("shown values", () => {
  it("shows the solved pelvis height under Auto, never 0", () => {
    assert.equal(NEUTRAL_POSE.hips.height_m, null);
    assert.deepEqual(shownValue(NEUTRAL_POSE, "hips.height_m", { hipsY: 0.93 }), { value: 0.93, auto: true, follows: false });
    // Before the stage has solved anything: a standing height, not the floor.
    assert.equal(shownValue(NEUTRAL_POSE, "hips.height_m").value, 0.9);
    const seated = { ...NEUTRAL_POSE, orientation: "seated" as const };
    assert.equal(shownValue(seated, "hips.height_m").value, 0.5);
    const manual = setPoseValue(NEUTRAL_POSE, "hips.height_m", 0.7);
    assert.deepEqual(shownValue(manual, "hips.height_m", { hipsY: 0.93 }), { value: 0.7, auto: false, follows: false });
  });

  it("shows a flat-footed ankle as following the floor", () => {
    const squat = setPoseValue(setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", 90), "left_leg.hip_flexion", 70);
    const shown = shownValue(squat, "left_leg.ankle_dorsiflexion", { flatFoot: (side) => side === "left" });
    assert.equal(shown.follows, true);
    assert.equal(shown.value, 20);
    assert.equal(shownValue(squat, "right_leg.ankle_dorsiflexion", { flatFoot: (side) => side === "left" }).follows, false);
  });

  it("shows a bar not placed yet where its first edit starts", () => {
    assert.equal(shownValue(NEUTRAL_POSE, "implement.height_m").value, 0.9);
    assert.equal(shownValue(NEUTRAL_POSE, "implement.grip_width_m").value, 0.45);
  });
});
