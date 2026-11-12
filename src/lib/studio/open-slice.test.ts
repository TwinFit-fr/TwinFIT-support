import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_SCENE, useStudioStore } from "./store.ts";

const st = () => useStudioStore.getState();

/** How many times subscribers are told about a change while `fn` runs. */
function notifications(fn: () => void): number {
  let count = 0;
  const off = useStudioStore.subscribe(() => count++);
  fn();
  off();
  return count;
}

describe("what the studio has open", () => {
  it("starts on the shared empty scene", () => {
    assert.equal(st().scene, EMPTY_SCENE);
  });

  it("choosing another exercise drops the clip, the previewed items and the in-between time in one change", () => {
    useStudioStore.setState({ exerciseId: "e1", vectorId: "v1", previewItems: [{ kind: "load", code: "DUMBBELL" }], scrubTime: 1.5 });
    assert.equal(notifications(() => st().selectExercise("e2")), 1);
    assert.equal(st().exerciseId, "e2");
    assert.equal(st().vectorId, null);
    assert.deepEqual(st().previewItems, []);
    assert.equal(st().scrubTime, null);
    assert.equal(notifications(() => st().selectExercise("e2")), 0, "the same exercise changes nothing");
  });

  it("keeps the scene, the previewed items and the bones when the new ones hold the same values", () => {
    st().setScene({ ...EMPTY_SCENE, avatarId: "a1", sockets: [{ id: "hand_l", bone: "LeftHand" }] });
    const scene = st().scene;
    assert.equal(notifications(() => st().setScene({ ...EMPTY_SCENE, avatarId: "a1", sockets: [{ id: "hand_l", bone: "LeftHand" }] })), 0);
    assert.equal(st().scene, scene);
    st().setModelBones(["Hips", "Spine"]);
    assert.equal(notifications(() => st().setModelBones(["Hips", "Spine"])), 0);
    assert.equal(notifications(() => st().setEquipmentModels({})), 0);
  });

  it("another avatar forgets the previous avatar's bones", () => {
    st().setAvatar("a1");
    st().setModelBones(["Hips"]);
    st().setAvatar("a2");
    assert.deepEqual(st().modelBones, []);
  });

  it("another clip clears the in-between time", () => {
    useStudioStore.setState({ vectorId: "v1", scrubTime: 2 });
    st().setVector("v2");
    assert.equal(st().vectorId, "v2");
    assert.equal(st().scrubTime, null);
  });
});
