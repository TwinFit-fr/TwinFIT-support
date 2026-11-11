import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { setPoseValue, type PoseAngles } from "./anatomy.ts";
import { DEFAULT_PARAMS, type TemplateExercise } from "./exercise-templates.ts";
import { automaticPoses, carrySetByYou, changedPaths, giveBack, keptSummary, pinnedPoints, pointName, pointStates, rebuildMatch, setPoints, withPin } from "./point-state.ts";
import { templateDraft } from "./template-draft.ts";

const CATALOG = JSON.parse(readFileSync(new URL("./__fixtures__/catalog-exercises.json", import.meta.url), "utf8")) as (TemplateExercise & { exo_id: number })[];
const byName = (name: string) => CATALOG.find((ex) => ex.name === name)!;
const CURL = byName("Dumbbell Biceps Curl");
const DEADLIFT = byName("Barbell Deadlift");
const SQUAT = byName("Air Squat");

const set = (pose: PoseAngles, path: string, value: number | null) => setPoseValue(pose, path, value);

describe("automatic poses", () => {
  it("are what the template builds for the draft's own settings", () => {
    const draft = templateDraft(CURL, { ...DEFAULT_PARAMS, range: "partial" });
    assert.deepEqual(automaticPoses(CURL, draft), draft.poses);
  });

  it("do not exist without a template base: raw AI angles, a neutral pose, an older clip", () => {
    const draft = templateDraft(CURL, DEFAULT_PARAMS);
    assert.equal(automaticPoses(CURL, { poses: draft.poses, meta: { template: null, template_params: null } }), null);
    assert.equal(automaticPoses(CURL, { poses: draft.poses, meta: {} }), null);
    assert.equal(automaticPoses(null, draft), null);
  });
});

describe("the state of a point", () => {
  const draft = templateDraft(CURL, DEFAULT_PARAMS);
  const auto = draft.poses[1];

  it("is automatic while its joints are the automatic pose's", () => {
    const states = pointStates(auto, auto);
    assert.ok(Object.values(states).every((s) => s === "automatic"));
    assert.deepEqual(setPoints(auto, auto), []);
  });

  it("is set by you once one of its joints differs; a wrist sets the hand, not the elbow", () => {
    const pose = set(auto, "left_arm.wrist_flexion", 30);
    const states = pointStates(pose, auto);
    assert.equal(states.left_hand, "set");
    assert.equal(states.left_elbow, "automatic");
    assert.equal(states.right_hand, "automatic");
    assert.deepEqual(setPoints(pose, auto), ["left_hand"]);
  });

  it("an elbow bend sets the elbow and the hand at the end of it", () => {
    const pose = set(auto, "right_arm.elbow_flexion", (auto.right_arm.elbow_flexion ?? 0) + 10);
    assert.deepEqual(setPoints(pose, auto), ["right_elbow", "right_hand"]);
  });

  it("a pelvis height set by hand sets the hips (an automatic height is null)", () => {
    const pose = set(auto, "hips.height_m", 0.8);
    assert.deepEqual(setPoints(pose, auto), ["hips"]);
  });

  it("a height goal a drag resolved on the rig still counts as automatic", () => {
    const dl = templateDraft(DEADLIFT, DEFAULT_PARAMS);
    const k = dl.poses.findIndex((p) => p.goal);
    assert.ok(k >= 0, "the deadlift template has a goal");
    const goalAuto = dl.poses[k];
    const path = goalAuto.goal!.by === "pelvis" ? "hips.height_m" : "hips.pitch";
    const resolved = set({ ...goalAuto, goal: undefined }, path, 0.61);
    assert.equal(changedPaths(resolved, goalAuto).has(path), false);
    assert.equal(pointStates(resolved, goalAuto).hips, "automatic");
  });
});

describe("giving a point back", () => {
  const draft = templateDraft(CURL, DEFAULT_PARAMS);
  const auto = draft.poses[1];

  it("returns its joints to the automatic pose and leaves the rest as it is", () => {
    let pose = set(auto, "left_arm.wrist_flexion", 30);
    pose = set(pose, "left_arm.elbow_flexion", 20);
    pose = set(pose, "head.pitch", 15);
    const back = giveBack(pose, auto, "left_hand");
    assert.equal(back.left_arm.wrist_flexion, auto.left_arm.wrist_flexion);
    assert.equal(back.left_arm.elbow_flexion, auto.left_arm.elbow_flexion);
    assert.equal(back.head.pitch, 15);
    assert.deepEqual(setPoints(back, auto), ["head"]);
  });

  it("gives an elbow back without touching the wrist below it", () => {
    let pose = set(auto, "left_arm.wrist_flexion", 30);
    pose = set(pose, "left_arm.elbow_flexion", 20);
    const back = giveBack(pose, auto, "left_elbow");
    assert.equal(back.left_arm.elbow_flexion, auto.left_arm.elbow_flexion);
    assert.equal(back.left_arm.wrist_flexion, 30);
  });

  it("puts an automatic pelvis height back to automatic, and the template's goal with it", () => {
    const dl = templateDraft(DEADLIFT, DEFAULT_PARAMS);
    const goalAuto = dl.poses.find((p) => p.goal)!;
    const dragged = set(set({ ...goalAuto, goal: undefined }, "hips.height_m", 0.5), "hips.forward_m", 0.1);
    const back = giveBack(dragged, goalAuto, "hips");
    assert.deepEqual(back.goal, goalAuto.goal);
    assert.equal(back.hips.height_m, goalAuto.hips.height_m);
    assert.equal(back.hips.forward_m, goalAuto.hips.forward_m);
  });

  it("keeps the point's pin", () => {
    const pinned = withPin(set(auto, "left_arm.wrist_flexion", 30), "left_hand", true, [0.2, 1, 0.3])!;
    assert.deepEqual(giveBack(pinned, auto, "left_hand").anchors, { left_hand: [0.2, 1, 0.3] });
  });
});

describe("carrying what you set across a rebuild", () => {
  const before = templateDraft(SQUAT, DEFAULT_PARAMS).poses;
  const next = templateDraft(SQUAT, { ...DEFAULT_PARAMS, range: "deep" }).poses;

  it("is tried on a setting that changes the poses", () => {
    assert.notDeepEqual(before[1], next[1]);
  });

  it("keeps the joints you set in each pose and takes everything else from the new build", () => {
    const current = before.map((p, i) => (i === 1 ? set(p, "left_arm.wrist_flexion", 33) : p));
    const carried = carrySetByYou(current, before, next)!;
    assert.equal(carried.poses[1].left_arm.wrist_flexion, 33);
    // The knees, still automatic, follow the new range.
    assert.equal(carried.poses[1].left_leg.knee_flexion, next[1].left_leg.knee_flexion);
    assert.notEqual(carried.poses[1].left_leg.knee_flexion, before[1].left_leg.knee_flexion);
    assert.deepEqual(carried.poses[0], next[0]);
    assert.deepEqual(carried.kept, before.map((_, i) => (i === 1 ? ["left_hand"] : [])));
    // What was kept is still set by you against the new automatic pose.
    assert.deepEqual(setPoints(carried.poses[1], next[1]), ["left_hand"]);
  });

  it("keeps a joint you set even where the new build moves the same joint", () => {
    const current = before.map((p, i) => (i === 1 ? set(p, "left_leg.knee_flexion", 50) : p));
    const carried = carrySetByYou(current, before, next)!;
    assert.equal(carried.poses[1].left_leg.knee_flexion, 50);
    assert.equal(carried.poses[1].right_leg.knee_flexion, next[1].right_leg.knee_flexion);
    assert.deepEqual(carried.kept[1], ["left_knee", "left_foot"]);
    assert.equal(keptSummary(carried.kept), "Kept what you set: left leg in pose 2.");
  });

  it("keeps pins you added", () => {
    const current = before.map((p, i) => (i === 0 ? withPin(p, "right_foot", true, [0.1, 0.08, 0])! : p));
    const carried = carrySetByYou(current, before, next)!;
    assert.deepEqual(carried.poses[0].anchors, { right_foot: [0.1, 0.08, 0] });
  });

  it("changes nothing when nothing was set by hand", () => {
    const carried = carrySetByYou(before, before, next)!;
    assert.deepEqual(carried.poses, next);
    assert.ok(carried.kept.every((k) => k.length === 0));
  });

  it("cannot match poses when one was added or removed", () => {
    assert.equal(carrySetByYou([...before, before[0]], before, next), null);
    assert.equal(carrySetByYou(before.slice(1), before, next), null);
  });

  it("says what it kept, pose by pose", () => {
    assert.equal(keptSummary([[], ["left_hand"], []]), "Kept what you set: left hand in pose 2.");
    assert.equal(keptSummary([["hips"], ["hips"]]), "Kept what you set: hips in every pose.");
    assert.equal(keptSummary([["left_hand", "hips"], [], ["chest"]]), "Kept what you set: left hand and hips in pose 1; chest in pose 3.");
    assert.equal(keptSummary([[], []]), null);
    assert.equal(keptSummary([["head", "left_elbow", "right_elbow", "left_hand", "right_hand"], ["left_elbow"]]), "Kept what you set: head, left arm and right arm in pose 1; left elbow in pose 2.");
  });
});

describe("pins", () => {
  const pose = templateDraft(CURL, DEFAULT_PARAMS).poses[0];

  it("pin a pinnable point where it is drawn, and unpin it", () => {
    const pinned = withPin(pose, "left_foot", true, [0.1, 0.08, 0.02])!;
    assert.deepEqual(pinnedPoints(pinned), ["left_foot"]);
    const free = withPin(pinned, "left_foot", false, undefined)!;
    assert.deepEqual(pinnedPoints(free), []);
    assert.equal(free.anchors, undefined);
  });

  it("do nothing for a point that cannot be pinned, an unknown position or no change", () => {
    assert.equal(withPin(pose, "chest", true, [0, 1, 0]), null);
    assert.equal(withPin(pose, "left_hand", true, undefined), null);
    assert.equal(withPin(pose, "left_hand", false, undefined), null);
  });
});

describe("how a point and a rebuild are said", () => {
  it("names the point with its state for assistive technology", () => {
    assert.equal(pointName("left_hand", { state: "set", pinned: true, hint: "moves the arm" }), "Left hand, set by you, pinned, dragging moves the arm");
    assert.equal(pointName("hips", { state: "automatic", pinned: false, hint: "raises the pelvis" }), "Hips, automatic, dragging raises the pelvis");
    assert.equal(pointName("head", { state: null, pinned: false, hint: "turns the head" }), "Head, dragging turns the head");
  });

  it("matches poses one to one, or says why it cannot", () => {
    const poses = templateDraft(SQUAT, DEFAULT_PARAMS).poses;
    assert.deepEqual(rebuildMatch(poses, poses), { kind: "match" });
    assert.deepEqual(rebuildMatch([...poses, poses[0]], poses), { kind: "count", poses: poses.length + 1, built: poses.length });
    assert.deepEqual(rebuildMatch(poses, null), { kind: "no-base", poses: poses.length });
  });
});
