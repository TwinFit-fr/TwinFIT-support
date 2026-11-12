import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { useStudioStore } from "./store.ts";

const st = () => useStudioStore.getState();

describe("playback and view toggles in the store", () => {
  it("starts playing at normal speed with the grid, the equipment and mocap cleaning on", () => {
    assert.equal(st().playing, true);
    assert.equal(st().scrubTime, null);
    assert.equal(st().speed, 1);
    assert.equal(st().showGrid, true);
    assert.equal(st().showEquipment, true);
    assert.equal(st().cleanMocap, true);
  });

  it("play and pause leave the in-between time; asking for what is already so changes nothing", () => {
    useStudioStore.setState({ playing: false, scrubTime: 1.2 });
    st().togglePlaying();
    assert.equal(st().playing, true);
    assert.equal(st().scrubTime, null);
    const before = st();
    st().setPlaying(true);
    assert.equal(st(), before);
  });

  it("a playhead step without a pose editor sets playing and the in-between time only", () => {
    st().setStageTime({ playing: false, scrubTime: 0.5, keyframe: 2 });
    assert.equal(st().playing, false);
    assert.equal(st().scrubTime, 0.5);
    assert.equal(st().poseEdit, null);
  });

  it("toggles the view switches and sets the speed", () => {
    st().toggleGrid();
    st().toggleEquipment();
    st().toggleCleanMocap();
    st().setSpeed(0.5);
    assert.equal(st().showGrid, false);
    assert.equal(st().showEquipment, false);
    assert.equal(st().cleanMocap, false);
    assert.equal(st().speed, 0.5);
  });
});
