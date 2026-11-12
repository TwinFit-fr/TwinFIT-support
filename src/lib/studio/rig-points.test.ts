import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectedSockets, equipmentLabel, fromMm, mannequinSockets, roundOffset, sameSocket, snapOffset, socketLabel, socketOrigin, socketsForBones, toMm } from "./rig-points.ts";

describe("rig points", () => {
  it("names sockets the way people read them", () => {
    assert.equal(socketLabel("hand_l"), "Left hand");
    assert.equal(socketLabel("hand_r"), "Right hand");
    assert.equal(socketLabel("back"), "Back");
    assert.equal(socketLabel("upper_back"), "Upper back");
    assert.equal(socketLabel("left_foot"), "Left foot");
    assert.equal(socketLabel("hip-r"), "Right hip");
    assert.equal(equipmentLabel("load:DUMBBELL"), "Dumbbell");
    assert.equal(equipmentLabel("support:FLAT_BENCH"), "Flat bench");
  });

  it("detects the sockets of a Meshy rig from its stored bone map", () => {
    const sockets = socketsForBones({ LeftHand: "LeftHand", RightHand: "RightHand", Spine1: "Spine01", Hips: "Hips" });
    assert.deepEqual(sockets.map((s) => [s.id, s.bone]), [["hand_l", "LeftHand"], ["hand_r", "RightHand"], ["back", "Spine01"], ["feet", "Hips"]]);
    const detected = detectedSockets({ params: { bones: { LeftHand: "LeftHand", Spine2: "Spine02", Spine1: "Spine01" } } })!;
    assert.equal(detected.back.bone, "Spine02", "the upper spine is preferred");
    assert.equal(detected.hand_r, undefined);
  });

  it("knows the mannequin's sockets at its height, and nothing for an upload", () => {
    const detected = detectedSockets({ params: { generated: "mannequin" }, height_m: 1.75 })!;
    assert.deepEqual(detected.hand_l.offset, [0.05, 0, 0]);
    assert.deepEqual(mannequinSockets(3.5)[3].offset, [0, -1.96, 0]);
    assert.equal(detectedSockets({ params: { placeholder: true } }), null);
    assert.equal(detectedSockets({ params: null }), null);
  });

  it("tells detected, moved and hand-made sockets apart, rounding aside", () => {
    const detected = detectedSockets({ params: { generated: "mannequin" }, height_m: 1.75 });
    assert.equal(socketOrigin({ id: "back", bone: "mixamorigSpine2", offset: [0, 0, -0.1602] }, detected), "detected");
    assert.equal(socketOrigin({ id: "hand_l", bone: "mixamorigLeftHand", offset: [0.11, 0, 0], rotation: [3.4, -90, 0] }, detected), "moved");
    assert.equal(socketOrigin({ id: "hand_l", bone: "mixamorigLeftHand", offset: [0.05, 0, 0], rotation: [0, 0, 0] }, detected), "detected");
    assert.equal(socketOrigin({ id: "head", bone: "mixamorigHead" }, detected), "manual");
    assert.equal(socketOrigin({ id: "back", bone: "mixamorigSpine2", offset: [0, 0, -0.16] }, null), "manual");
    assert.equal(sameSocket({ id: "a", bone: "X" }, { id: "a", bone: "Y" }), false);
  });

  it("converts metres to millimetres and snaps without float noise", () => {
    assert.equal(toMm(0.11), 110);
    assert.equal(toMm(-0.003), -3);
    assert.equal(fromMm(52.5), 0.0525);
    assert.deepEqual(snapOffset([0.1124, -0.0026, 0]), [0.11, -0.005, 0]);
    assert.deepEqual(roundOffset([0.11249, -0.00051, 0.3]), [0.112, -0.001, 0.3]);
  });
});
