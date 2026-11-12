import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_RIG_HISTORY, RIG_HISTORY_LIMIT, endRigGesture, recordRig, redoRig, rigDirty, undoRig, type RigSnapshot } from "./rig-history.ts";

const at = (x: number, target: string | null = "hand_l"): RigSnapshot => ({
  sockets: x === 0 ? null : { avatarId: "a", sockets: [{ id: "hand_l", bone: "LeftHand", offset: [x, 0, 0] }] },
  placements: {},
  target,
});

describe("rig history", () => {
  it("pushes the state before each separate edit and clears the redo stack", () => {
    let h = recordRig(EMPTY_RIG_HISTORY, at(0), "Moved Left hand");
    h = recordRig(h, at(1), "Moved Left hand");
    assert.equal(h.past.length, 2);
    const undone = undoRig(h, at(2))!;
    assert.equal(undone.history.future.length, 1);
    const again = recordRig(undone.history, undone.snapshot, "Rotated Left hand");
    assert.equal(again.future.length, 0);
  });

  it("folds every edit of one drag into a single step", () => {
    let h = recordRig(EMPTY_RIG_HISTORY, at(0), "Moved Left hand", true);
    h = recordRig(h, at(1), "Moved Left hand", true);
    h = recordRig(h, at(2), "Moved Left hand", true);
    assert.equal(h.past.length, 1);
    assert.deepEqual(h.past[0].snapshot, at(0));
    h = endRigGesture(h);
    h = recordRig(h, at(3), "Moved Left hand", true);
    assert.equal(h.past.length, 2, "the next drag opens its own step");
  });

  it("undoes back to the untouched rig and redoes forward again", () => {
    let h = recordRig(EMPTY_RIG_HISTORY, at(0), "Moved Left hand");
    const current = at(5);
    const undone = undoRig(h, current)!;
    assert.deepEqual(undone.snapshot, at(0));
    assert.equal(undone.label, "Moved Left hand");
    assert.equal(rigDirty(undone.snapshot), false, "back at the start nothing is unsaved");
    h = undone.history;
    const redone = redoRig(h, undone.snapshot)!;
    assert.deepEqual(redone.snapshot, current);
    assert.equal(redone.history.past.length, 1);
    assert.equal(redone.history.future.length, 0);
  });

  it("brings back the selection that went with each state", () => {
    const h = recordRig(EMPTY_RIG_HISTORY, at(0, "back"), "Removed Back");
    assert.equal(undoRig(h, at(1, null))!.snapshot.target, "back");
  });

  it("returns null with nothing to undo or redo, and ends any open gesture on a step", () => {
    assert.equal(undoRig(EMPTY_RIG_HISTORY, at(0)), null);
    assert.equal(redoRig(EMPTY_RIG_HISTORY, at(0)), null);
    const open = recordRig(EMPTY_RIG_HISTORY, at(0), "Moved Left hand", true);
    assert.equal(undoRig(open, at(1))!.history.gestureOpen, false);
  });

  it("keeps at most the limit of steps, dropping the oldest", () => {
    let h = EMPTY_RIG_HISTORY;
    for (let i = 0; i < RIG_HISTORY_LIMIT + 5; i += 1) h = recordRig(h, at(i), `step ${i}`);
    assert.equal(h.past.length, RIG_HISTORY_LIMIT);
    assert.equal(h.past[0].label, "step 5");
  });

  it("calls a rig dirty when sockets or placements are drafted", () => {
    assert.equal(rigDirty({ sockets: null, placements: {} }), false);
    assert.equal(rigDirty({ sockets: null, placements: { "load:DUMBBELL": { size_m: 0.3 } } }), true);
    assert.equal(rigDirty(at(1)), true);
  });
});
