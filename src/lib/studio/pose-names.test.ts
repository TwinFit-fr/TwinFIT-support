import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NEUTRAL_POSE, poseClipFromDraft, setPoseValue } from "./anatomy.ts";
import { clipLabels, labelsFromClip } from "./pose-names.ts";
import { useStudioStore } from "./store.ts";

const pose = (knee: number) => setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", knee);

describe("pose names in the clip file", () => {
  it("writes one trimmed name per pose, or none at all", () => {
    assert.deepEqual(clipLabels([" bottom ", "lockout"], 2), ["bottom", "lockout"]);
    assert.deepEqual(clipLabels(["bottom"], 3), ["bottom", "", ""]);
    assert.equal(clipLabels(["", "  "], 2), null);
    assert.equal(clipLabels(null, 2), null);
  });

  it("reads names back only when there is one per pose", () => {
    assert.deepEqual(labelsFromClip({ labels: ["a", "b"] }, 2), ["a", "b"]);
    assert.equal(labelsFromClip({ labels: ["a", "b"] }, 3), null);
    assert.equal(labelsFromClip({ labels: ["a", 2] }, 2), null);
    assert.equal(labelsFromClip({}, 2), null);
  });

  describe("through the editor", () => {
    beforeEach(() =>
      useStudioStore.getState().startPoseEdit({
        vectorId: "v1",
        sourceSeq: 9,
        exerciseId: "e1",
        avatarId: "a1",
        items: [],
        poses: [pose(0), pose(60), pose(120)],
        mode: "pingpong",
        durationS: 4,
        fps: 30,
        twoHanded: false,
        grip: null,
        mirror: true,
        // The meta of the clip as it was opened, with the names of an older save.
        meta: { labels: ["old a", "old b", "old c"], template: "squat" },
        origin: { kind: "clip", vectorId: "v1", seq: 9, from: null },
      }),
    );

    const saved = () => {
      const d = useStudioStore.getState().poseEdit!;
      return poseClipFromDraft(d);
    };
    const reopened = () => {
      const clip = saved();
      return labelsFromClip(clip.meta, clip.keyframes.length ? useStudioStore.getState().poseEdit!.poses.length : 0);
    };

    it("saves the names typed in the editor, not the ones the clip had", () => {
      const s = useStudioStore.getState();
      s.setPoseLabel(0, "standing");
      s.setPoseLabel(1, "halfway");
      s.setPoseLabel(2, "bottom");
      assert.deepEqual(reopened(), ["standing", "halfway", "bottom"]);
    });

    it("keeps each name on its pose after a move, a duplicate and a removal", () => {
      const s = useStudioStore.getState();
      s.setPoseLabel(0, "standing");
      s.setPoseLabel(1, "halfway");
      s.setPoseLabel(2, "bottom");
      useStudioStore.getState().movePose(2, -1); // standing, bottom, halfway
      useStudioStore.getState().duplicatePose(0); // standing, standing copy, bottom, halfway
      useStudioStore.getState().removePose(3); // standing, standing copy, bottom
      const d = useStudioStore.getState().poseEdit!;
      const names = reopened()!;
      assert.deepEqual(names, ["standing", "standing copy", "bottom"]);
      // Each name is still on the pose it was typed for.
      assert.equal(d.poses[2].left_leg.knee_flexion, 120);
      assert.equal(d.poses[1].left_leg.knee_flexion, 0);
    });

    it("clears names an older save had when every name is removed", () => {
      const s = useStudioStore.getState();
      s.setPoseLabel(0, "");
      assert.equal(saved().meta?.labels, null);
    });
  });
});
