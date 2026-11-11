import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { NEUTRAL_POSE, getPoseValue, setPoseValue, type PoseAngles } from "./anatomy.ts";
import { captureRestPose } from "./pose-clip.ts";
import { applyPoseEdit, dragPoint } from "./pose-drag.ts";
import { nudgeMetres } from "./pose-hit.ts";
import { POINT_IDS, metresPerPixel, mirrorPoint, nudgeOffset, pointerOnCameraPlane, toScreen, type PointId } from "./pose-points.ts";
import { clampForDrag } from "./pose-reach.ts";
import { createPoseSession, median } from "./pose-session.ts";
import { crookedRig, mannequin } from "./test-rigs.ts";

const CTX = { twoHanded: false, grip: null, sockets: [] };

function sessions() {
  const plain = mannequin();
  const crooked = crookedRig().model;
  return [
    { name: "mannequin (T-pose)", session: createPoseSession(plain, captureRestPose(plain)) },
    { name: "crooked rig (Meshy-like)", session: createPoseSession(crooked, captureRestPose(crooked)) },
  ];
}

/** Drag a point from where it is by `offset`, in `ticks` steps like a pointer would; returns the last pose. */
function drag(session: ReturnType<typeof createPoseSession>, start: PoseAngles, id: PointId, offset: THREE.Vector3, ticks = 6, mirror = false, view?: THREE.Vector3) {
  let pose = start;
  const from = session.solve(pose, CTX).points[id]!.clone();
  for (let k = 1; k <= ticks; k += 1) {
    const target = from.clone().addScaledVector(offset, k / ticks);
    pose = dragPoint(session, pose, CTX, id, target, { mirror, view });
    session.solve(pose, CTX);
  }
  return { pose, from, target: from.clone().add(offset) };
}

describe("body points", () => {
  for (const { name, session } of sessions()) {
    it(`every point is available on the ${name}`, () => {
      assert.deepEqual([...session.available].sort(), [...POINT_IDS].sort());
    });
  }
  it("left and right points mirror each other, central ones do not", () => {
    assert.equal(mirrorPoint("left_hand"), "right_hand");
    assert.equal(mirrorPoint("right_knee"), "left_knee");
    assert.equal(mirrorPoint("chest"), null);
  });
});

describe("dragging a point", () => {
  for (const { name, session } of sessions()) {
    // Targets the body can reach: where the point is in a pose with those joints turned.
    for (const [id, edits] of [
      ["left_hand", [["left_arm.shoulder_plane", 70], ["left_arm.shoulder_elevation", 60], ["left_arm.elbow_flexion", 50]]],
      ["right_hand", [["right_arm.shoulder_plane", 30], ["right_arm.shoulder_elevation", 100], ["right_arm.elbow_flexion", 20]]],
      ["left_elbow", [["left_arm.shoulder_plane", 90], ["left_arm.shoulder_elevation", 45]]],
      ["left_foot", [["left_leg.hip_flexion", 40], ["left_leg.knee_flexion", 50]]],
      ["right_knee", [["right_leg.hip_flexion", 45], ["right_leg.hip_abduction", 10]]],
      ["chest", [["lumbar.flexion", 25], ["thoracic.lateral", 8]]],
      ["head", [["head.pitch", 30], ["head.yaw", 35]]],
    ] as [PointId, [string, number][]][]) {
      it(`${id} follows the pointer on the ${name}, joints inside their training range`, () => {
        const goal = edits.reduce((p, [path, v]) => setPoseValue(p, path, v), NEUTRAL_POSE);
        const at = session.solve(goal, CTX).points[id]!;
        const offset = at.clone().sub(session.solve(NEUTRAL_POSE, CTX).points[id]!);
        const { pose, from, target } = drag(session, NEUTRAL_POSE, id, offset);
        const now = session.solve(pose, CTX).points[id]!;
        const before = from.distanceTo(target);
        const after = now.distanceTo(target);
        assert.ok(after < Math.max(0.01, before * 0.15), `${id}: ${(after * 100).toFixed(1)} cm from the target (started ${(before * 100).toFixed(1)} cm away)`);
        const reach = session.reach(id)!;
        for (const dof of reach.dofs) {
          const v = getPoseValue(pose, dof)!;
          assert.equal(clampForDrag(dof, v), v, `${dof} = ${v} is outside its normal training range`);
        }
      });
    }

    it(`the hips move up, down and forward, never sideways, on the ${name}`, () => {
      const { pose } = drag(session, NEUTRAL_POSE, "hips", new THREE.Vector3(0.3, -0.2, 0.1));
      const hips = session.solve(pose, CTX).points.hips!;
      const rest = session.solve(NEUTRAL_POSE, CTX).points.hips!;
      assert.ok(Math.abs(hips.y - (rest.y - 0.2)) < 0.01, `pelvis height ${hips.y.toFixed(3)}`);
      assert.ok(Math.abs(pose.hips.forward_m - 0.1) < 0.01, `forward ${pose.hips.forward_m}`);
      assert.ok(Math.abs(hips.x - rest.x) < 0.02, "no sideways shift");
    });

    it(`a point out of reach stays on the body on the ${name}`, () => {
      const { pose } = drag(session, NEUTRAL_POSE, "left_hand", new THREE.Vector3(2, 2, 2));
      const solved = session.solve(pose, CTX);
      const shoulder = solved.fk.get(session.rig.names.LeftArm!)!.pos;
      const hand = solved.points.left_hand!;
      assert.ok(hand.distanceTo(shoulder) < 0.7, "the hand is still at the end of the arm");
    });
  }

  it("a drag never leaves an arm past the limits the body check enforces (behind the body)", () => {
    const { session } = sessions()[0];
    // From a three-quarter camera, dragging a hand up and to the right on screen goes up and back.
    const { pose } = drag(session, NEUTRAL_POSE, "left_hand", new THREE.Vector3(0.25, 0.75, -0.45), 10, true);
    for (const arm of [pose.left_arm, pose.right_arm]) assert.ok(!(arm.shoulder_plane < -45 && arm.shoulder_elevation > 80), JSON.stringify(arm));
  });

  for (const { name, session } of sessions()) {
    it(`a hand lifted up to the chest curls the arm with the elbow kept low on the ${name}`, () => {
      // Seen from the front: the depth is the body's choice, the hand stays under the pointer.
      const view = new THREE.Vector3(0, 0, -1);
      const { pose, target } = drag(session, NEUTRAL_POSE, "left_hand", new THREE.Vector3(0, 0.4, 0), 10, false, view);
      const solved = session.solve(pose, CTX);
      const hand = solved.points.left_hand!;
      assert.ok(Math.hypot(hand.x - target.x, hand.y - target.y) < 0.01, `the hand is ${(Math.hypot(hand.x - target.x, hand.y - target.y) * 100).toFixed(1)} cm off the pointer (${hand.toArray().map((v) => v.toFixed(2))})`);
      const elbow = solved.points.left_elbow!;
      const shoulder = solved.fk.get(session.rig.names.LeftArm!)!.pos;
      assert.ok(elbow.y < shoulder.y - 0.15, `elbow ${elbow.y.toFixed(2)} m, shoulder ${shoulder.y.toFixed(2)} m`);
      assert.ok(pose.left_arm.elbow_flexion > 60, `elbow flexion ${pose.left_arm.elbow_flexion}`);
    });
  }

  for (const { name, session } of sessions()) {
    it(`a head dragged farther than the neck can turn stays under the pointer (the spine bends) on the ${name}`, () => {
      const view = new THREE.Vector3(0, 0, -1);
      const { pose, target } = drag(session, NEUTRAL_POSE, "head", new THREE.Vector3(0.18, -0.12, 0), 10, false, view);
      const head = session.solve(pose, CTX).points.head!;
      const off = Math.hypot(head.x - target.x, head.y - target.y);
      assert.ok(off < 0.015, `the head is ${(off * 100).toFixed(1)} cm off the pointer`);
      assert.ok(pose.lumbar.lateral !== 0 || pose.thoracic.lateral !== 0, "the spine bent sideways");
    });
    it(`a small head drag to the side turns the neck and leaves the spine as it was on the ${name}`, () => {
      const view = new THREE.Vector3(0, 0, -1);
      const { pose } = drag(session, NEUTRAL_POSE, "head", new THREE.Vector3(0.025, 0.005, 0), 4, false, view);
      for (const [section, field] of [["lumbar", "flexion"], ["lumbar", "lateral"], ["thoracic", "flexion"], ["thoracic", "lateral"]] as const) {
        assert.ok(Math.abs(pose[section][field]) < 1.5, `${section}.${field} = ${pose[section][field]}`);
      }
    });
  }

  it("each drag tick solves the pose once", () => {
    const { session } = sessions()[0];
    let pose = NEUTRAL_POSE;
    const from = session.solve(pose, CTX).points.left_hand!.clone();
    const before = session.stats.solves;
    for (let k = 1; k <= 10; k += 1) {
      pose = dragPoint(session, pose, CTX, "left_hand", from.clone().add(new THREE.Vector3(0, 0.02 * k, 0.02 * k)), { mirror: false });
      session.solve(pose, CTX);
      session.solve(pose, CTX); // drawing it again is a cache hit
    }
    assert.equal(session.stats.solves - before, 10);
    assert.ok(median(session.stats.solveMs)! >= 0);
  });

  it("Mirror on: the other side follows a drag with the same angles; off: it stays", () => {
    const { session } = sessions()[0];
    const on = drag(session, NEUTRAL_POSE, "left_hand", new THREE.Vector3(0.1, 0.3, 0.2), 6, true).pose;
    assert.deepEqual(on.right_arm, on.left_arm);
    const off = drag(session, NEUTRAL_POSE, "left_hand", new THREE.Vector3(0.1, 0.3, 0.2), 6, false).pose;
    assert.deepEqual(off.right_arm, NEUTRAL_POSE.right_arm);
    assert.notDeepEqual(off.left_arm, NEUTRAL_POSE.left_arm);
  });

  it("a pinned hand moves its pin with the drag", () => {
    const { session } = sessions()[0];
    const at = session.solve(NEUTRAL_POSE, CTX).points.left_hand!;
    const pinned: PoseAngles = { ...NEUTRAL_POSE, anchors: { left_hand: [at.x, at.y, at.z] } };
    const target = at.clone().add(new THREE.Vector3(0, 0.2, 0.2));
    const next = dragPoint(session, pinned, CTX, "left_hand", target, { mirror: false });
    assert.deepEqual(next.anchors?.left_hand, target.toArray().map((v) => Math.round(v * 1000) / 1000));
  });

  it("a template goal ends on the first drag without moving the body", () => {
    const { session } = sessions()[0];
    const withGoal: PoseAngles = { ...setPoseValue(NEUTRAL_POSE, "left_leg.knee_flexion", 40), goal: { point: "hands", ref: "knee", by: "pelvis" } };
    const before = session.solve(withGoal, CTX).points.hips!.clone();
    const elbow = session.solve(withGoal, CTX).points.left_elbow!.clone();
    const next = dragPoint(session, withGoal, CTX, "left_elbow", elbow, { mirror: false });
    assert.equal(next.goal, undefined);
    const after = session.solve(next, CTX).points.hips!;
    assert.ok(after.distanceTo(before) < 0.005, `hips moved ${(after.distanceTo(before) * 100).toFixed(1)} cm`);
  });
});

describe("one rule for sliders and drags", () => {
  it("Mirror writes the same value to the other side", () => {
    const p = applyPoseEdit(NEUTRAL_POSE, { "left_leg.knee_flexion": 50 }, { mirror: true });
    assert.equal(p.right_leg.knee_flexion, 50);
    assert.equal(applyPoseEdit(NEUTRAL_POSE, { "left_leg.knee_flexion": 50 }, { mirror: false }).right_leg.knee_flexion, 0);
  });
  it("touching the pelvis ends a goal; other fields keep it", () => {
    const g: PoseAngles = { ...NEUTRAL_POSE, goal: { point: "hands", ref: "knee", by: "pelvis" } };
    assert.equal(applyPoseEdit(g, { "hips.pitch": 10 }, { mirror: true }).goal, undefined);
    assert.ok(applyPoseEdit(g, { "head.pitch": 10 }, { mirror: true }).goal);
  });
});

describe("camera maths", () => {
  const camera = new THREE.PerspectiveCamera(38, 1.5, 0.05, 100);
  camera.position.set(0, 1.35, 4.4);
  camera.lookAt(0, 0.95, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  it("the pointer over a point lands on that point, and moves in the camera plane", () => {
    const point = new THREE.Vector3(0.3, 1.2, 0.1);
    const screen = toScreen(camera, point, 900, 600)!;
    const ndc = { x: (screen.x / 900) * 2 - 1, y: 1 - (screen.y / 600) * 2 };
    const hit = pointerOnCameraPlane(camera, ndc, point)!;
    assert.ok(hit.distanceTo(point) < 1e-6);
    const moved = pointerOnCameraPlane(camera, { x: ndc.x + 0.1, y: ndc.y }, point)!;
    const forward = camera.getWorldDirection(new THREE.Vector3());
    assert.ok(Math.abs(moved.clone().sub(point).dot(forward)) < 1e-6, "stays in the plane facing the camera");
  });

  it("arrow keys nudge along the screen, PageUp away from the viewer", () => {
    const right = nudgeOffset(camera, "ArrowRight", 0.01);
    assert.ok(Math.abs(right.length() - 0.01) < 1e-9 && right.x > 0);
    assert.ok(nudgeOffset(camera, "ArrowUp", 0.05).y > 0.04);
    assert.ok(nudgeOffset(camera, "PageUp", 0.01).z < 0);
  });

  it("a nudge is a few pixels on screen at any zoom", () => {
    const point = new THREE.Vector3(0, 1.2, 0);
    for (const distance of [2, 4.4, 12]) {
      const cam = camera.clone();
      cam.position.set(0, 1.2, distance);
      cam.lookAt(point);
      cam.updateMatrixWorld();
      const step = nudgeMetres(metresPerPixel(cam, point, 600), false);
      const moved = point.clone().add(nudgeOffset(cam, "ArrowUp", step));
      const px = toScreen(cam, point, 900, 600)!.y - toScreen(cam, moved, 900, 600)!.y;
      assert.ok(px >= 3.5 && px <= 4.5, `${distance} m away: ${px.toFixed(2)} px`);
    }
  });
});
