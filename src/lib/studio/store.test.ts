import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NEUTRAL_POSE, setPoseValue } from "./anatomy.ts";
import { useStudioStore } from "./store.ts";

const base = () => ({
  vectorId: null,
  sourceSeq: null,
  exerciseId: "e1",
  avatarId: "a1",
  items: [],
  poses: [NEUTRAL_POSE, NEUTRAL_POSE],
  mode: "pingpong" as const,
  durationS: 4,
  fps: 30,
  twoHanded: false,
  grip: null,
  mirror: true,
  meta: { exo_id: 4 },
  origin: { kind: "template" as const, template: "curl" },
});

describe("pose editor undo", () => {
  beforeEach(() => useStudioStore.getState().startPoseEdit(base()));

  it("restores weights, labels and mode together with the poses", () => {
    const s = useStudioStore.getState();
    s.replacePoses({ poses: [NEUTRAL_POSE, NEUTRAL_POSE, NEUTRAL_POSE], weights: [1, 2, 3], labels: ["a", "b", "c"], mode: "cycle", origin: { kind: "ai", template: null, params: null, notes: null } });
    assert.equal(useStudioStore.getState().poseEdit?.poses.length, 3);
    useStudioStore.getState().undoPose();
    const d = useStudioStore.getState().poseEdit!;
    assert.equal(d.poses.length, 2);
    assert.equal(d.weights, null);
    assert.equal(d.labels, null);
    assert.equal(d.mode, "pingpong");
    useStudioStore.getState().redoPose();
    assert.deepEqual(useStudioStore.getState().poseEdit?.weights, [1, 2, 3]);
  });

  it("a rebuild from settings can stay on the pose being edited, and one undo brings the old poses and origin back", () => {
    const s = useStudioStore.getState();
    s.setPoseKeyframe(1);
    const deep = { kind: "template" as const, template: "squat", params: { range: "deep" } };
    s.replacePoses({ poses: [NEUTRAL_POSE, setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", 120)], origin: deep, meta: { template_params: { range: "deep" } }, keyframe: 1 });
    assert.equal(useStudioStore.getState().poseEdit?.keyframe, 1);
    assert.deepEqual(useStudioStore.getState().poseEdit?.origin, deep);
    useStudioStore.getState().undoPose();
    assert.deepEqual(useStudioStore.getState().poseEdit?.origin, { kind: "template", template: "curl" });
    assert.equal(useStudioStore.getState().poseEdit?.poses[1], NEUTRAL_POSE);
  });

  it("keeps weights aligned with poses after undoing a duplicate", () => {
    const s = useStudioStore.getState();
    s.setPoseWeight(1, 2);
    s.endPoseGesture();
    s.duplicatePose(0);
    assert.equal(useStudioStore.getState().poseEdit?.weights?.length, 3);
    useStudioStore.getState().undoPose();
    const d = useStudioStore.getState().poseEdit!;
    assert.equal(d.poses.length, 2);
    assert.equal(d.weights?.length, 2);
  });

  it("folds a drag into one undo step and separates edits outside a gesture", () => {
    const s = useStudioStore.getState();
    for (let v = 10; v <= 50; v += 10) s.updatePose(0, setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", v), true);
    s.endPoseGesture();
    assert.equal(useStudioStore.getState().poseEdit?.history.length, 1);
    s.updatePose(0, setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", 70));
    s.updatePose(0, setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", 80));
    assert.equal(useStudioStore.getState().poseEdit?.history.length, 3);
    useStudioStore.getState().undoPose();
    assert.equal(useStudioStore.getState().poseEdit?.poses[0].left_leg.knee_flexion, 70);
    useStudioStore.getState().undoPose();
    useStudioStore.getState().undoPose();
    assert.equal(useStudioStore.getState().poseEdit?.poses[0].left_leg.knee_flexion, NEUTRAL_POSE.left_leg.knee_flexion);
  });
});

describe("pose document origin", () => {
  beforeEach(() => useStudioStore.getState().startPoseEdit(base()));

  it("undoing an AI draft brings back the previous meta and origin, so the draft's body-check flags go with it", () => {
    useStudioStore.getState().replacePoses({
      poses: [NEUTRAL_POSE, NEUTRAL_POSE],
      origin: { kind: "ai", template: "lunge", params: { range: "deep" }, notes: null },
      meta: { template: "lunge", unilateral: true, airborne: true },
    });
    let d = useStudioStore.getState().poseEdit!;
    assert.equal(d.meta.unilateral, true);
    assert.equal(d.origin.kind, "ai");
    useStudioStore.getState().undoPose();
    d = useStudioStore.getState().poseEdit!;
    assert.deepEqual(d.meta, { exo_id: 4 });
    assert.deepEqual(d.origin, { kind: "template", template: "curl" });
    useStudioStore.getState().redoPose();
    d = useStudioStore.getState().poseEdit!;
    assert.equal(d.meta.unilateral, true);
    assert.equal(d.origin.kind, "ai");
  });

  it("opens untouched and not dirty: an automatic draft can be dropped without asking", () => {
    const d = useStudioStore.getState().poseEdit!;
    assert.equal(d.edited, false);
    assert.equal(d.dirty, false);
  });

  it("marks the first manual change as edited by the user, keeping the origin, and undo clears the mark", () => {
    useStudioStore.getState().updatePose(0, setPoseValue(NEUTRAL_POSE, "left_arm.elbow_flexion", 90));
    let d = useStudioStore.getState().poseEdit!;
    assert.equal(d.edited, true);
    assert.equal(d.dirty, true);
    assert.equal(d.origin.kind, "template");
    useStudioStore.getState().undoPose();
    d = useStudioStore.getState().poseEdit!;
    assert.equal(d.edited, false);
  });

  it("a drag is one edit: every tick of the gesture keeps the mark", () => {
    const s = useStudioStore.getState();
    for (let v = 10; v <= 40; v += 10) s.updatePose(0, setPoseValue(NEUTRAL_POSE, "left_arm.elbow_flexion", v), true);
    s.endPoseGesture();
    assert.equal(useStudioStore.getState().poseEdit?.edited, true);
  });

  it("the mirror toggle is a tool setting, not an edit", () => {
    useStudioStore.getState().setPoseEditOptions({ mirror: false });
    assert.equal(useStudioStore.getState().poseEdit?.edited, false);
  });

  it("an AI draft after a manual edit starts a fresh, unedited origin", () => {
    useStudioStore.getState().updatePose(0, setPoseValue(NEUTRAL_POSE, "left_arm.elbow_flexion", 90));
    useStudioStore.getState().replacePoses({ poses: [NEUTRAL_POSE], origin: { kind: "ai", template: null, params: null, notes: null } });
    assert.equal(useStudioStore.getState().poseEdit?.edited, false);
    useStudioStore.getState().undoPose();
    assert.equal(useStudioStore.getState().poseEdit?.edited, true);
  });

  it("saving makes the stored clip the one being edited, selected, with nothing unsaved", () => {
    useStudioStore.getState().updatePose(0, setPoseValue(NEUTRAL_POSE, "left_arm.elbow_flexion", 90));
    useStudioStore.getState().markPoseSaved({ id: "v9", seq: 48 });
    const s = useStudioStore.getState();
    assert.equal(s.vectorId, "v9");
    assert.equal(s.poseEdit?.vectorId, "v9");
    assert.equal(s.poseEdit?.sourceSeq, 48);
    assert.equal(s.poseEdit?.dirty, false);
    assert.equal(s.poseEdit?.edited, false);
    assert.deepEqual(s.poseEdit?.origin, { kind: "clip", vectorId: "v9", seq: 48, from: "curl template, edited" });
    assert.equal(s.poseEdit?.meta.exo_id, 4);
  });
});

describe("rig drafts", () => {
  it("are bound to the avatar and dropped when another avatar is chosen", () => {
    const s = useStudioStore.getState();
    s.setAvatar("a1");
    s.updateDraftSocket("a1", [{ id: "hand_r", bone: "RightHand" }], "hand_r", { offset: [0.1, 0, 0] });
    assert.equal(useStudioStore.getState().draftSockets?.avatarId, "a1");
    s.setAvatar("a2");
    assert.equal(useStudioStore.getState().draftSockets, null);
    assert.equal(useStudioStore.getState().edit.mode, "off");
  });

  it("adds and removes sockets in the draft", () => {
    const s = useStudioStore.getState();
    s.setAvatar("a3");
    s.addDraftSocket("a3", [{ id: "hand_r", bone: "RightHand" }], { id: "head", bone: "Head" });
    assert.deepEqual(useStudioStore.getState().draftSockets?.sockets.map((x) => x.id), ["hand_r", "head"]);
    assert.equal(useStudioStore.getState().edit.target, "head");
    s.removeDraftSocket("a3", [], "head");
    assert.deepEqual(useStudioStore.getState().draftSockets?.sockets.map((x) => x.id), ["hand_r"]);
  });
});

describe("AI draft apply", () => {
  beforeEach(() => useStudioStore.getState().startPoseEdit(base()));

  it("is one undo step that restores poses, settings, origin and meta together", () => {
    const before = useStudioStore.getState().poseEdit!;
    useStudioStore.getState().setPoseKeyframe(1);
    useStudioStore.getState().replacePoses({
      poses: [NEUTRAL_POSE, setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", 120)],
      labels: ["standing", "bottom"],
      weights: [1, 3],
      mode: "cycle",
      grip: null,
      twoHanded: false,
      meta: { template: "squat", template_params: { range: "deep" } },
      origin: { kind: "ai", template: "squat", params: { range: "deep" }, notes: null, explain: { notes: null, conflicts: ["x"], adjusted: [], checks: [], instructions: "deeper" } },
      keyframe: 1,
    });
    const after = useStudioStore.getState().poseEdit!;
    assert.equal(after.keyframe, 1);
    assert.equal(after.edited, false);
    assert.deepEqual(after.meta.template_params, { range: "deep" });
    useStudioStore.getState().undoPose();
    const d = useStudioStore.getState().poseEdit!;
    assert.deepEqual(d.origin, before.origin);
    assert.deepEqual(d.meta, before.meta);
    assert.equal(d.poses, before.poses);
    assert.equal(d.labels, null);
    assert.equal(d.mode, "pingpong");
  });

  it("gives every opened draft its own identity, kept through edits and saves", () => {
    const first = useStudioStore.getState().poseEdit!.editId;
    useStudioStore.getState().updatePose(0, setPoseValue(NEUTRAL_POSE, "left_arm.elbow_flexion", 30));
    useStudioStore.getState().markPoseSaved({ id: "v9", seq: 9 });
    assert.equal(useStudioStore.getState().poseEdit!.editId, first);
    useStudioStore.getState().startPoseEdit(base());
    assert.notEqual(useStudioStore.getState().poseEdit!.editId, first);
  });
});
