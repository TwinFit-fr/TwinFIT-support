import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { useStudioStore } from "./store.ts";
import type { AvatarSocket } from "./types";

const saved: AvatarSocket[] = [
  { id: "hand_l", bone: "LeftHand", offset: [0.05, 0, 0] },
  { id: "back", bone: "Spine2", offset: [0, 0, -0.16] },
];
const st = () => useStudioStore.getState();

describe("rig editor in the store", () => {
  beforeEach(() => {
    st().clearDrafts();
    st().setEdit({ mode: "sockets", target: "hand_l", snap: false });
  });

  it("opens with snapping off", () => {
    useStudioStore.setState({ edit: { mode: "off", target: null, tool: "translate", snap: false } });
    assert.equal(st().edit.snap, false);
  });

  it("makes one undo step of a drag and says what it undid", () => {
    st().updateDraftSocket("a", saved, "hand_l", { offset: [0.06, 0, 0] }, { gesture: true });
    st().updateDraftSocket("a", saved, "hand_l", { offset: [0.07, 0, 0] }, { gesture: true });
    st().endRigGesture();
    assert.equal(st().rigHistory.past.length, 1);
    assert.equal(st().undoRig(), "Moved Left hand");
    assert.equal(st().draftSockets, null, "back to the saved sockets: nothing unsaved");
    assert.equal(st().redoRig(), "Moved Left hand");
    assert.deepEqual(st().draftSockets!.sockets[0].offset, [0.07, 0, 0]);
  });

  it("undoes a removed point and selects it again", () => {
    st().removeDraftSocket("a", saved, "hand_l");
    assert.equal(st().edit.target, "back");
    assert.equal(st().undoRig(), "Removed Left hand");
    assert.equal(st().edit.target, "hand_l");
  });

  it("undoes an added point and a placement change", () => {
    st().addDraftSocket("a", saved, { id: "head", bone: "Head", offset: [0, 0, 0] });
    st().setDraftPlacement("load:DUMBBELL", { size_m: 0.35, offset: [0, 0.01, 0] });
    assert.equal(st().undoRig(), "Moved Dumbbell");
    assert.deepEqual(st().draftPlacements, {});
    assert.equal(st().undoRig(), "Added Head");
    assert.equal(st().draftSockets, null);
    assert.equal(st().undoRig(), null);
  });

  it("drops the history with Discard and with another avatar", () => {
    st().updateDraftSocket("a", saved, "back", { rotation: [0, 90, 0] });
    st().clearDrafts();
    assert.equal(st().rigHistory.past.length, 0);
    st().updateDraftSocket("a", saved, "back", { rotation: [0, 90, 0] });
    st().setAvatar("another");
    assert.equal(st().rigHistory.past.length, 0);
    assert.equal(st().edit.mode, "off");
  });
});
