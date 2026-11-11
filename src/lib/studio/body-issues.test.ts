import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEUTRAL_POSE, POSE_CLIP_VERSION, buildKeyframes, type PoseAngles, type PoseClipJson } from "./anatomy.ts";
import { balanceAt, failingStretches, freeSidesAt, issuesAt, keySeverities, listWords, locateIssues, placeOfBone, placeOfPath, reportHeadline, spansOf, type ReportKey } from "./body-issues.ts";
import { captureRestPose } from "./pose-clip.ts";
import type { FrameReading, PoseLocations } from "./pose-validate.ts";
import { validatePoseClip } from "./pose-validate.ts";
import { mannequin } from "./test-rigs.ts";
import { timelineKeys } from "./timeline.ts";

const COUNT = 9;
const DURATION = 4;
const STEP = DURATION / (COUNT - 1);

/** A standing frame with both feet planted, balanced, hands level. */
function frame(i: number, patch: Partial<FrameReading> = {}): FrameReading {
  return {
    t: i * STEP,
    orientation: "standing",
    feet: [
      { side: "left", tilt: 0, sink: 0, slide: 0, ankle: [0.1, 0.08, 0] },
      { side: "right", tilt: 0, sink: 0, slide: 0, ankle: [-0.1, 0.08, 0] },
    ],
    lifted: [],
    lowest: { bone: "mixamorig:LeftToeBase", logical: "LeftToeBase", y: 0.01 },
    balance: { com: [0, 0.9, 0.02], heel: -0.09, toes: 0.2, left: 0.16, right: -0.16 },
    handGap: 0,
    hands: { left: 0.8, right: 0.8 },
    ...patch,
  };
}

function loc(frames: FrameReading[], patch: Partial<PoseLocations> = {}): PoseLocations {
  return { frames, ranges: [], duration: DURATION, unilateral: false, airborne: false, moving: false, ...patch };
}

/** Two poses as a cycle over 4 s: pose 1 at 0, pose 2 at 2 s, pose 1 again at 4 s. */
const KEYS: ReportKey[] = timelineKeys({ poseCount: 2, durationS: DURATION, mode: "cycle" }).map((k) => ({ t: k.t, pose: k.pose }));

describe("body issues: where a failing check is", () => {
  it("passes a clean standing clip, every check counted as run", () => {
    const report = locateIssues(loc(Array.from({ length: COUNT }, (_, i) => frame(i))), KEYS);
    assert.deepEqual(report.issues, []);
    assert.deepEqual(report.skipped, []);
    assert.equal(report.partial, null);
    assert.equal(report.ran.length, 6);
    assert.deepEqual(reportHeadline(report), { tone: "pass", text: "Body checks pass" });
  });

  it("puts balance on the hips, on the key pose inside the failing stretch, with the floor area", () => {
    // Frames 3 to 5 (1.5 to 2.5 s) lean back past the heels; pose 2 is at 2 s.
    const frames = Array.from({ length: COUNT }, (_, i) => frame(i, i >= 3 && i <= 5 ? { balance: { com: [0, 0.9, -0.09 - 0.1 - (i === 4 ? 0.05 : 0)], heel: -0.09, toes: 0.2, left: 0.16, right: -0.16 } } : {}));
    const report = locateIssues(loc(frames), KEYS, ["arms down", "bottom"]);
    assert.equal(report.issues.length, 1);
    const [issue] = report.issues;
    assert.equal(issue.id, "balance-back");
    assert.equal(issue.severity, "error");
    assert.equal(issue.point, "hips");
    assert.equal(issue.joint, "Hips");
    assert.equal(issue.pose, 1);
    assert.equal(issue.t, 2);
    assert.equal(issue.where, "Pose 2 · bottom");
    assert.equal(issue.title, "Off balance: tips backward");
    assert.equal(issue.fix, "Bring the hips and chest forward over the feet");
    assert.equal(issue.detail, "Centre of mass 15 cm behind the heels");
    assert.deepEqual(issue.spans, [{ from: 1.25, to: 2.75 }]);
    assert.equal(issue.balance?.length, 3);
    const spot = balanceAt(issue, 2);
    assert.ok(spot && Math.abs(spot.com[2] + 0.24) < 1e-9, "the spot at 2 s is the frame at 2 s");
    assert.equal(balanceAt(issue, 0), null, "nothing to draw outside the stretch");
    assert.deepEqual(reportHeadline(report), { tone: "fail", text: "1 problem" });
  });

  it("says which foot slides and when, on its worst frame between keys", () => {
    const frames = Array.from({ length: COUNT }, (_, i) =>
      frame(i, i === 1 || i === 2 ? { feet: [{ side: "left", tilt: 0, sink: 0, slide: 0, ankle: [0.1, 0.08, 0] }, { side: "right", tilt: 0, sink: 0, slide: i === 1 ? 0.05 : 0.07, ankle: [-0.1, 0.08, 0] }] } : {}),
    );
    const [issue] = locateIssues(loc(frames), KEYS).issues;
    assert.equal(issue.id, "slide:right");
    assert.equal(issue.point, "right_foot");
    assert.equal(issue.joint, "RightFoot");
    assert.equal(issue.title, "Right foot slides");
    assert.equal(issue.pose, null);
    assert.equal(issue.t, 1);
    assert.equal(issue.where, "0.3–1.3 s");
  });

  it("does not report a slide for a travelling or jumping exercise, and says why", () => {
    const frames = Array.from({ length: COUNT }, (_, i) => frame(i, { feet: [{ side: "left", tilt: 0, sink: 0, slide: 0.2, ankle: [0.1, 0.08, 0] }], balance: null }));
    const report = locateIssues(loc(frames, { moving: true }), KEYS);
    assert.deepEqual(report.issues, []);
    assert.deepEqual(report.skipped[0].checks, ["Feet that stay put", "Balance over the feet", "Both sides alike"]);
    assert.match(report.skipped[0].why, /travels/);
    assert.deepEqual(reportHeadline(report), { tone: "partial", text: "No problems · 3 of 6 checks ran" });
  });

  it("names the part that goes through the floor", () => {
    const frames = Array.from({ length: COUNT }, (_, i) => frame(i, i === 4 ? { lowest: { bone: "mixamorig:RightHand", logical: "RightHand", y: -0.06 } } : {}));
    const [issue] = locateIssues(loc(frames), KEYS).issues;
    assert.equal(issue.kind, "floor");
    assert.equal(issue.point, "right_hand");
    assert.equal(issue.title, "Right hand goes through the floor");
    assert.equal(issue.detail, "6 cm below the floor");
    assert.equal(issue.pose, 1);
  });

  it("puts a joint out of range on its key pose, once per pose even when the pose is reached again", () => {
    const frames = Array.from({ length: COUNT }, (_, i) => frame(i));
    const ranges = [
      { key: 0, t: 0, path: "left_leg.knee_flexion", value: 162, limit: [0, 150] as [number, number], severity: "error" as const, kind: "range" as const },
      { key: 2, t: 4, path: "left_leg.knee_flexion", value: 162, limit: [0, 150] as [number, number], severity: "error" as const, kind: "range" as const },
      { key: 1, t: 2, path: "right_arm.elbow_flexion", value: 150, limit: [0, 140] as [number, number], severity: "warning" as const, kind: "training" as const },
    ];
    const report = locateIssues(loc(frames, { ranges }), KEYS, ["start", "bottom"]);
    assert.equal(report.issues.length, 2);
    const [knee, elbow] = report.issues;
    assert.equal(knee.title, "Left knee flexion past its range");
    assert.equal(knee.detail, "162°, the body allows 0 to 150°");
    assert.equal(knee.point, "left_knee");
    assert.equal(knee.joint, "LeftLeg");
    assert.equal(knee.where, "Pose 1 · start");
    assert.equal(knee.fix, "Set left knee flexion between 0 and 150°");
    assert.deepEqual(knee.keyTimes, [0, 4]);
    assert.equal(elbow.severity, "warning");
    assert.equal(elbow.point, "right_elbow");
    assert.deepEqual(keySeverities(report, timelineKeys({ poseCount: 2, durationS: DURATION, mode: "cycle" }), 0.01), ["error", "warning", "error"]);
    assert.deepEqual(issuesAt(report, 1, 0.01), [], "nothing between the keys");
  });

  it("is truthful about a lying exercise: the feet and balance checks did not run", () => {
    const frames = Array.from({ length: COUNT }, (_, i) => frame(i, { orientation: "supine", feet: [], balance: null, handGap: null, hands: null }));
    const report = locateIssues(loc(frames), KEYS);
    assert.deepEqual(report.issues, []);
    assert.equal(report.skipped.length, 1);
    assert.equal(listWords(report.skipped[0].checks), "soles flat on the floor, feet that stay put, balance over the feet and both sides alike");
    assert.match(report.skipped[0].why, /lying on the back for the whole movement/);
    assert.deepEqual(report.ran, ["Joints in range", "Nothing through the floor"]);
    assert.notEqual(reportHeadline(report).text, "Body checks pass");
  });

  it("says when feet and balance were checked only part of the time", () => {
    const frames = Array.from({ length: COUNT }, (_, i) => frame(i, i >= 4 ? { orientation: "kneeling", feet: [], balance: null } : {}));
    const report = locateIssues(loc(frames), KEYS);
    assert.match(report.partial ?? "", /only while standing \(0\.0–1\.8 s\), not while kneeling/);
  });

  it("merges failing stretches per severity for the ruler", () => {
    const frames = Array.from({ length: COUNT }, (_, i) =>
      frame(i, {
        ...(i >= 2 && i <= 3 ? { lowest: { bone: "x", logical: "LeftHand", y: -0.05 } } : {}),
        ...(i >= 3 && i <= 4 ? { balance: { com: [0, 0.9, 0.35], heel: -0.09, toes: 0.2, left: 0.16, right: -0.16 } } : {}),
      }),
    );
    const stretches = failingStretches(locateIssues(loc(frames), KEYS));
    assert.equal(stretches.length, 1);
    assert.equal(stretches[0].severity, "error");
    assert.deepEqual(stretches[0].span, { from: 0.75, to: 2.25 });
    assert.equal(stretches[0].titles.length, 2);
  });

  it("reports a foot off the floor in a stance the exercise keeps on both feet", () => {
    // Pose 2 (2 s) lifts the left foot 30 cm; the frames either side rise towards it.
    const frames = Array.from({ length: COUNT }, (_, i) => {
      const height = [0, 0, 0, 0.12, 0.3, 0.12, 0, 0, 0][i];
      return frame(i, height ? { feet: [{ side: "right", tilt: 0, sink: 0, slide: 0, ankle: [-0.1, 0.08, 0] }], lifted: [{ side: "left", height, free: true }] } : {});
    });
    const report = locateIssues(loc(frames), KEYS, ["arms down", "curled"], { freeFeet: [[], []] });
    assert.equal(report.issues.length, 1);
    const [issue] = report.issues;
    assert.equal(issue.id, "lifted:left");
    assert.equal(issue.kind, "lifted");
    assert.equal(issue.severity, "warning");
    assert.equal(issue.point, "left_foot");
    assert.equal(issue.joint, "LeftFoot");
    assert.equal(issue.title, "Left foot off the floor");
    assert.equal(issue.detail, "30 cm up; this exercise keeps both feet down");
    assert.equal(issue.pose, 1);
    assert.equal(issue.where, "Pose 2 · curled");
    assert.deepEqual(issue.spans, [{ from: 1.25, to: 2.75 }]);
    assert.equal(issue.fix, "Give the left foot back to automatic");
    assert.notEqual(reportHeadline(report).tone, "pass", "a lifted foot never reads as feet on the floor");
    const pinned = locateIssues(loc(frames), KEYS, null, { freeFeet: [[], []], pinned: [[], ["left_foot"]] }).issues[0];
    assert.equal(pinned.fix, "Unpin it (P), then give the left foot back to automatic", "a pin would hold the foot up");
  });

  it("leaves a foot the exercise lifts on purpose alone, and warns when there is no template to ask", () => {
    const frames = Array.from({ length: COUNT }, (_, i) =>
      frame(i, i >= 3 && i <= 5 ? { feet: [{ side: "right", tilt: 0, sink: 0, slide: 0, ankle: [-0.1, 0.08, 0] }], lifted: [{ side: "left", height: 0.25, free: true }] } : {}),
    );
    assert.deepEqual(locateIssues(loc(frames), KEYS, null, { freeFeet: [[], ["left"]] }).issues, [], "pose 2 of the template lifts the left foot");
    const unknown = locateIssues(loc(frames), KEYS).issues;
    assert.equal(unknown.length, 1);
    assert.equal(unknown[0].detail, "25 cm up while the other foot carries the body");
    assert.deepEqual(locateIssues(loc(frames, { airborne: true }), KEYS).issues.filter((i) => i.kind === "lifted"), [], "a jump leaves the floor");
  });

  it("asks the key poses on either side of a moment which feet are meant to be free", () => {
    assert.deepEqual(freeSidesAt(KEYS, [[], ["left"]], 1), ["left"], "rising towards pose 2");
    assert.deepEqual(freeSidesAt(KEYS, [[], ["left"]], 0), [], "on pose 1 itself");
    assert.deepEqual(freeSidesAt(KEYS, [[], ["left"]], 2), ["left"]);
    assert.equal(freeSidesAt(KEYS, null, 1), null);
  });

  it("spans runs of frames half a sample wide each side, clamped to the clip", () => {
    const frames = Array.from({ length: COUNT }, (_, i) => frame(i));
    assert.deepEqual(spansOf([0, 1, 5], frames, STEP, DURATION), [{ from: 0, to: 0.75 }, { from: 2.25, to: 2.75 }]);
  });

  it("maps joints and bones to the body point that fixes them", () => {
    assert.equal(placeOfPath("left_arm.shoulder_elevation").point, "left_elbow");
    assert.equal(placeOfPath("left_arm.wrist_flexion").point, "left_hand");
    assert.equal(placeOfPath("right_leg.hip_flexion").joint, "RightUpLeg");
    assert.equal(placeOfPath("right_leg.ankle_dorsiflexion").point, "right_foot");
    assert.equal(placeOfPath("thoracic.flexion").point, "chest");
    assert.equal(placeOfPath("head.pitch").point, "head");
    assert.equal(placeOfBone("LeftToeBase").point, "left_foot");
    assert.equal(placeOfBone("Head").joint, "HeadCenter");
  });
});

describe("body issues on a real rig", () => {
  const model = mannequin();
  const rest = captureRestPose(model);
  const clipOf = (poses: PoseAngles[]): PoseClipJson => ({ kind: "pose-angles", version: POSE_CLIP_VERSION, fps: 30, duration: DURATION, loop: true, keyframes: buildKeyframes(poses, DURATION, "cycle") });
  const keysOf = (n: number) => timelineKeys({ poseCount: n, durationS: DURATION, mode: "cycle" }).map((k) => ({ t: k.t, pose: k.pose }));

  it("locates nothing on a balanced standing clip, and leaves the validator's own result as it was", () => {
    const clip = clipOf([NEUTRAL_POSE, NEUTRAL_POSE]);
    const plain = validatePoseClip(model, clip, rest);
    const located = validatePoseClip(model, clip, rest, [], { locate: true });
    assert.equal(plain.located, undefined, "nothing extra unless asked");
    assert.deepEqual(located.issues, plain.issues);
    assert.ok(located.located && located.located.frames.length === 24);
    assert.deepEqual(locateIssues(located.located, keysOf(2)).issues, []);
  });

  it("finds a body leaning far back in pose 2 as off balance there, on the hips", () => {
    const lean: PoseAngles = { ...NEUTRAL_POSE, hips: { ...NEUTRAL_POSE.hips, pitch: -35 } };
    const v = validatePoseClip(model, clipOf([NEUTRAL_POSE, lean]), rest, [], { locate: true });
    assert.ok(v.issues.some((i) => i.code === "balance-back"), JSON.stringify(v.issues));
    const report = locateIssues(v.located!, keysOf(2));
    const balance = report.issues.find((i) => i.id === "balance-back");
    assert.ok(balance, JSON.stringify(report.issues.map((i) => i.id)));
    assert.equal(balance.pose, 1);
    assert.equal(balance.point, "hips");
    assert.ok(balance.balance && balance.balance.length > 0);
    assert.ok(issuesAt(report, 2, 0.01).some((i) => i.id === "balance-back"));
    assert.ok(!issuesAt(report, 0, 0.01).some((i) => i.id === "balance-back"), "pose 1 stands balanced");
  });

  it("finds a foot lifted by hand in a two-footed exercise, and not one the template lifts", () => {
    const lift: PoseAngles = { ...NEUTRAL_POSE, left_leg: { ...NEUTRAL_POSE.left_leg, hip_flexion: 70, knee_flexion: 90 } };
    const v = validatePoseClip(model, clipOf([NEUTRAL_POSE, lift]), rest, [], { locate: true });
    const report = locateIssues(v.located!, keysOf(2), null, { freeFeet: [[], []] });
    const lifted = report.issues.find((i) => i.id === "lifted:left");
    assert.ok(lifted, JSON.stringify(report.issues.map((i) => i.id)));
    assert.equal(lifted.pose, 1);
    assert.ok(issuesAt(report, 2, 0.01).some((i) => i.id === "lifted:left"));
    assert.ok(!issuesAt(report, 0, 0.01).some((i) => i.id === "lifted:left"), "both feet down in pose 1");
    const meant = locateIssues(v.located!, keysOf(2), null, { freeFeet: [[], ["left"]] });
    assert.ok(!meant.issues.some((i) => i.kind === "lifted"));
  });

  it("does not call a lying clip a pass", () => {
    const lying: PoseAngles = { ...NEUTRAL_POSE, orientation: "supine" };
    const v = validatePoseClip(model, clipOf([lying, lying]), rest, [], { locate: true });
    const report = locateIssues(v.located!, keysOf(2));
    assert.equal(report.skipped.length, 1);
    assert.equal(reportHeadline(report).tone === "pass", false);
  });
});
