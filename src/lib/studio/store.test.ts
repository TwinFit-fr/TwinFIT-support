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
  meta: {},
});

describe("pose editor undo", () => {
  beforeEach(() => useStudioStore.getState().startPoseEdit(base()));

  it("restores weights, labels and mode together with the poses", () => {
    const s = useStudioStore.getState();
    s.replacePoses({ poses: [NEUTRAL_POSE, NEUTRAL_POSE, NEUTRAL_POSE], weights: [1, 2, 3], labels: ["a", "b", "c"], mode: "cycle" });
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
