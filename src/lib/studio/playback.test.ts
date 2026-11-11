import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NEUTRAL_POSE, setPoseValue } from "./anatomy.ts";
import { holdNearestKey, pause, play, seek, stageTime, stepFrames, stepKey } from "./playback.ts";
import { useStudioStore } from "./store.ts";
import { useTimelineClock } from "./timeline-clock.ts";

// Three poses as a boomerang over 4 s: keys at 0 (1), 1 (2), 2 (3), 3 (2 again), 4 (1 again).
const open = () =>
  useStudioStore.getState().startPoseEdit({
    vectorId: null,
    sourceSeq: null,
    exerciseId: "e1",
    avatarId: "a1",
    items: [],
    poses: [NEUTRAL_POSE, setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", 60), setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", 110)],
    mode: "pingpong",
    durationS: 4,
    fps: 30,
    twoHanded: false,
    grip: null,
    mirror: true,
    meta: {},
    origin: { kind: "template", template: "squat" },
  });

const state = () => useStudioStore.getState();

describe("playhead on the pose editor", () => {
  beforeEach(() => {
    useTimelineClock.setState({ playTime: 0, heldAt: null, clipDuration: null });
    open();
  });

  it("holds a key pose when the playhead lands on it, and shows an in-between elsewhere", () => {
    seek(1.01);
    assert.equal(state().scrubTime, null);
    assert.equal(state().poseEdit?.keyframe, 1);
    assert.equal(stageTime(), 1);
    seek(1.5);
    assert.equal(state().scrubTime, 1.5);
    assert.equal(state().poseEdit?.keyframe, 1, "the selected pose stays while looking between keys");
    assert.equal(stageTime(), 1.5);
  });

  it("remembers which occurrence of a pose the playhead was put on", () => {
    seek(3);
    assert.equal(state().poseEdit?.keyframe, 1);
    assert.equal(stageTime(), 3);
    // Selecting the pose from the panel puts the playhead on its first occurrence.
    state().setPoseKeyframe(2);
    assert.equal(stageTime(), 2);
  });

  it("plays from the playhead and pauses where it is", () => {
    seek(2);
    play();
    assert.equal(state().playing, true);
    assert.equal(useTimelineClock.getState().playTime, 2);
    useTimelineClock.getState().setPlayTime(2.4);
    pause();
    assert.equal(state().playing, false);
    assert.equal(state().scrubTime, 2.4);
    play();
    useTimelineClock.getState().setPlayTime(3);
    pause();
    assert.equal(state().scrubTime, null, "paused on a key: that pose is held");
    assert.equal(state().poseEdit?.keyframe, 1);
  });

  it("steps between keys and frames, inside the clip", () => {
    seek(1.5);
    stepKey(1);
    assert.equal(stageTime(), 2);
    stepKey(-1);
    assert.equal(stageTime(), 1);
    stepFrames(-60);
    assert.equal(stageTime(), 0);
    stepFrames(3);
    assert.ok(Math.abs(stageTime() - 0.1) < 1e-9);
    seek(99);
    assert.equal(stageTime(), 4);
  });

  it("a grab between keys holds the nearest key first", () => {
    seek(2.6);
    assert.equal(holdNearestKey(), 1);
    assert.equal(state().scrubTime, null);
    assert.equal(stageTime(), 3);
    assert.equal(holdNearestKey(), null, "already on a key");
  });

  it("an edit while looking at an in-between holds the edited pose", () => {
    seek(1.5);
    state().updatePose(0, setPoseValue(NEUTRAL_POSE, "hips.pitch", 10));
    assert.equal(state().scrubTime, null);
    seek(3.5);
    state().setPoseEditOptions({ durationS: 2 });
    assert.equal(state().scrubTime, 2, "a shorter loop keeps the in-between inside it");
  });
});
