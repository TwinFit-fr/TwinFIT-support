import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { NEUTRAL_POSE, setPoseValue, type PoseAngles } from "./anatomy.ts";
import { captureRestPose, type SolveContext } from "./pose-clip.ts";
import { dragPoint, mirrorApplies, settleDrag } from "./pose-drag.ts";
import { holdsBody, legAsDrawn } from "./pose-legs.ts";
import { pointerOnCameraPlane, toScreen, type PointId } from "./pose-points.ts";
import { createPoseSession, type PoseSession } from "./pose-session.ts";
import { crookedRig, mannequin } from "./test-rigs.ts";

const CTX: SolveContext = { twoHanded: false, grip: null, sockets: [] };
const SIZE = { w: 900, h: 800 };
/** The stage's three views (studio-canvas.tsx). */
const VIEWS = { front: [0, 1.35, 4.4], "three-quarter": [3.1, 1.75, 3.5], side: [4.6, 1.3, 0.2] } as const;
type View = keyof typeof VIEWS;

function camera(view: View) {
  const c = new THREE.PerspectiveCamera(38, SIZE.w / SIZE.h, 0.05, 100);
  c.position.fromArray(VIEWS[view]);
  c.lookAt(0, 0.95, 0);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}

function rigs() {
  const plain = mannequin();
  const crooked = crookedRig().model;
  return [
    { name: "mannequin", session: createPoseSession(plain, captureRestPose(plain)) },
    { name: "crooked rig", session: createPoseSession(crooked, captureRestPose(crooked)) },
  ];
}

const set = (pose: PoseAngles, edits: Record<string, number>) => Object.entries(edits).reduce((p, [path, v]) => setPoseValue(p, path, v), pose);

/**
 * A pointer drag as the stage does it: press on the point, move `dx`, `dy` screen pixels in
 * `ticks` steps (Mirror on unless said), release. Screen pixels are of a 900 x 800 stage.
 */
function pointerDrag(session: PoseSession, start: PoseAngles, view: View, id: PointId, dx: number, dy: number, { mirror = true, ticks = 12, ctx = CTX } = {}) {
  const cam = camera(view);
  const screen = (p: THREE.Vector3) => toScreen(cam, p, SIZE.w, SIZE.h)!;
  const before = session.solve(start, ctx);
  const through = before.points[id]!.clone();
  const from = screen(through);
  let pose = start;
  let swayed = 0;
  for (let k = 1; k <= ticks; k += 1) {
    const at = { x: from.x + (dx * k) / ticks, y: from.y + (dy * k) / ticks };
    const target = pointerOnCameraPlane(cam, { x: (at.x / SIZE.w) * 2 - 1, y: 1 - (at.y / SIZE.h) * 2 }, through)!;
    const viewDir = target.clone().sub(cam.position).normalize();
    pose = dragPoint(session, pose, ctx, id, target, { mirror, view: viewDir });
    swayed = Math.max(swayed, session.solve(pose, ctx).points.head!.distanceTo(before.points.head!));
  }
  pose = settleDrag(session, pose, ctx, id);
  const after = session.solve(pose, ctx);
  const at = screen(after.points[id]!);
  return {
    pose,
    before,
    after,
    /** Pixels between the point and the pointer at the end, and how far the point went. */
    off: Math.hypot(at.x - (from.x + dx), at.y - (from.y + dy)),
    moved: Math.hypot(at.x - from.x, at.y - from.y),
    /** The farthest the head went during the drag (metres): the rest of the body. */
    swayed,
    shift: (other: PointId) => after.points[other]!.distanceTo(before.points[other]!),
    lowest: Math.min(...[...after.fk.values()].map((t) => t.pos.y)),
  };
}

const floorOf = (session: PoseSession) => Math.min(...[...session.solve(NEUTRAL_POSE, CTX).fk.values()].map((t) => t.pos.y));

describe("a leg of a standing body, Mirror on", () => {
  for (const { name, session } of rigs()) {
    it(`a knee dragged up in the front view comes up under the pointer and the body stays put (${name})`, () => {
      const d = pointerDrag(session, NEUTRAL_POSE, "front", "left_knee", 0, -40);
      assert.ok(d.off < 4, `the knee is ${d.off.toFixed(1)} px off the pointer`);
      assert.ok(d.swayed < 0.005, `the head moved ${(d.swayed * 100).toFixed(1)} cm`);
      assert.ok(d.shift("right_foot") < 0.005 && d.shift("hips") < 0.005, "the standing foot and the pelvis stay");
      assert.deepEqual(d.pose.right_leg, NEUTRAL_POSE.right_leg, "the other leg keeps its angles");
      assert.ok(d.lowest > floorOf(session) - 0.01, "nothing goes through the floor");
    });

    it(`a small pull up already lifts the knee: no dead zone (${name})`, () => {
      const d = pointerDrag(session, NEUTRAL_POSE, "front", "left_knee", 0, -12);
      assert.ok(d.moved > 9 && d.off < 4, `moved ${d.moved.toFixed(1)} px, ${d.off.toFixed(1)} px off`);
    });

    it(`knee and foot dragged up and forward in the side view: the leg lifts in its own plane, the body stays (${name})`, () => {
      for (const id of ["left_knee", "left_foot", "right_knee", "right_foot"] as const) {
        const d = pointerDrag(session, NEUTRAL_POSE, "side", id, -40, -40);
        const leg = id.startsWith("left") ? d.pose.left_leg : d.pose.right_leg;
        assert.ok(d.moved > 30, `${id} moved ${d.moved.toFixed(1)} px`);
        assert.ok(d.swayed < 0.005 && d.shift("hips") < 0.005, `${id}: the body moved`);
        assert.ok(leg.hip_flexion > 15, `${id}: hip flexion ${leg.hip_flexion}`);
        assert.ok(Math.abs(leg.hip_abduction) < 8, `${id}: the leg swung ${leg.hip_abduction}° out of its plane`);
        assert.ok(d.lowest > floorOf(session) - 0.01, `${id}: through the floor`);
        if (id.endsWith("foot")) assert.ok(d.off < 4, `${id} is ${d.off.toFixed(1)} px off the pointer`);
      }
    });

    it(`every leg point follows a drag from the three-quarter view with the body still (${name})`, () => {
      for (const id of ["left_knee", "left_foot", "right_knee", "right_foot"] as const) {
        const d = pointerDrag(session, NEUTRAL_POSE, "three-quarter", id, 30, -30);
        // A foot gets there; a knee goes as far as the hip lets the thigh swing that way.
        if (id.endsWith("foot")) assert.ok(d.off < 6, `${id} is ${d.off.toFixed(1)} px off the pointer`);
        assert.ok(d.moved > 20, `${id} moved ${d.moved.toFixed(1)} px`);
        assert.ok(d.swayed < 0.005, `${id}: the head moved ${(d.swayed * 100).toFixed(1)} cm`);
      }
    });
  }

  it("Mirror does not apply to a standing leg, and does to a leg off the floor", () => {
    assert.equal(mirrorApplies(NEUTRAL_POSE, "left_knee"), false);
    assert.equal(mirrorApplies(NEUTRAL_POSE, "left_hand"), true);
    assert.equal(mirrorApplies({ ...NEUTRAL_POSE, orientation: "supine" }, "left_foot"), true);
    assert.equal(mirrorApplies(NEUTRAL_POSE, "hips"), false);
    const { session } = rigs()[0];
    const lying: PoseAngles = { ...NEUTRAL_POSE, orientation: "supine" };
    const d = pointerDrag(session, lying, "three-quarter", "left_knee", 0, -30);
    assert.deepEqual(d.pose.right_leg, d.pose.left_leg);
    assert.notDeepEqual(d.pose.left_leg, NEUTRAL_POSE.left_leg);
  });
});

describe("a leg in a stance the body already holds", () => {
  const { session } = rigs()[0];
  const squat = set(NEUTRAL_POSE, { "left_leg.hip_flexion": 80, "right_leg.hip_flexion": 80, "left_leg.knee_flexion": 95, "right_leg.knee_flexion": 95, "hips.pitch": 25 });
  const wide = set(NEUTRAL_POSE, { "left_leg.hip_abduction": 20, "right_leg.hip_abduction": 20 });

  for (const [label, pose] of [["a squat", squat], ["a wide stance", wide]] as const) {
    it(`in ${label}, a knee or a foot moves and the rest of the body does not`, () => {
      for (const id of ["left_knee", "left_foot"] as const) {
        for (const [view, dx, dy] of [["front", 30, -30], ["three-quarter", 0, -40], ["side", -30, -30]] as const) {
          const d = pointerDrag(session, pose, view, id, dx, dy);
          assert.ok(d.moved > 25, `${id} ${view}: moved ${d.moved.toFixed(1)} px`);
          assert.ok(d.swayed < 0.005, `${id} ${view}: the head moved ${(d.swayed * 100).toFixed(1)} cm`);
          assert.ok(d.shift("right_foot") < 0.005, `${id} ${view}: the other foot slid`);
        }
      }
    });
  }

  it("a pelvis lowered by hand: the leg takes the angles it is drawn with, then moves like any other", () => {
    const lowered = pointerDrag(session, NEUTRAL_POSE, "front", "hips", 0, 60).pose;
    assert.ok(lowered.hips.height_m !== null && lowered.left_leg.knee_flexion === 0, "the legs are bent by the solver, not by their angles");
    const solved = session.solve(lowered, CTX);
    const fitted = legAsDrawn(session, solved, lowered, "left");
    assert.ok(fitted.left_leg.knee_flexion > 30, `knee flexion ${fitted.left_leg.knee_flexion}`);
    const d = pointerDrag(session, lowered, "front", "left_knee", 30, 0);
    assert.ok(d.off < 5 && d.moved > 25, `the knee is ${d.off.toFixed(1)} px off the pointer`);
    assert.ok(d.swayed < 0.005 && d.shift("right_foot") < 0.005 && d.shift("right_knee") < 0.005, "the rest of the body stays");
  });

  it("the pelvis cannot be dragged higher than the legs reach: the feet stay on the floor", () => {
    for (const view of ["front", "three-quarter", "side"] as const) {
      const d = pointerDrag(session, NEUTRAL_POSE, view, "hips", 20, -45);
      assert.ok(d.shift("left_foot") < 0.005 && d.shift("right_foot") < 0.005, `${view}: a foot left the floor`);
    }
  });
});

describe("which foot carries the body", () => {
  const { session } = rigs()[0];

  it("a lifted foot is the free foot; put back where it stood, it carries the body again", () => {
    const up = pointerDrag(session, NEUTRAL_POSE, "side", "left_foot", -30, -30);
    assert.equal(up.pose.free_foot, "left");
    const back = pointerDrag(session, up.pose, "side", "left_foot", 30, 30);
    assert.equal(back.pose.free_foot, undefined);
    assert.ok(back.after.points.left_foot!.distanceTo(up.before.points.left_foot!) < 0.01, "the foot is back where it stood");
  });

  it("a foot slid along the floor rests there with its sole level, and the body does not hop when it is let go", () => {
    const d = pointerDrag(session, NEUTRAL_POSE, "front", "left_foot", 40, 0);
    assert.ok(d.off < 3 && d.swayed < 0.005, `${d.off.toFixed(1)} px off, head ${(d.swayed * 100).toFixed(1)} cm`);
    assert.ok(d.lowest > floorOf(session) - 0.005, "the toes do not dig into the floor");
  });

  it("the foot the body stands on while the other is up stays under it", () => {
    const up = pointerDrag(session, NEUTRAL_POSE, "front", "left_knee", 0, -40).pose;
    assert.equal(up.free_foot, "left");
    assert.equal(holdsBody(session, up, CTX, "right_foot"), true);
    assert.equal(holdsBody(session, up, CTX, "left_foot"), false);
    assert.equal(holdsBody(session, NEUTRAL_POSE, CTX, "right_foot"), false);
    const d = pointerDrag(session, up, "front", "right_foot", 30, -30);
    assert.deepEqual(d.pose, up);
  });

  it("both feet can be set apart one after the other: the second takes over from the first", () => {
    const left = pointerDrag(session, NEUTRAL_POSE, "front", "left_foot", 40, 0);
    const both = pointerDrag(session, left.pose, "front", "right_foot", -40, 0);
    assert.ok(both.off < 3, `the right foot is ${both.off.toFixed(1)} px off the pointer`);
    assert.ok(both.shift("left_foot") < 0.06, `the left foot moved ${(both.shift("left_foot") * 100).toFixed(1)} cm`);
    assert.ok(both.pose.left_leg.hip_abduction > 5 && both.pose.right_leg.hip_abduction > 5, "both legs are out");
  });
});

describe("the first pose of a clip, which is the stance the others stand on", () => {
  it("drags like a pose on its own: the candidates the search tries are not held to the old stance", () => {
    const { session } = rigs()[0];
    // As the editor does it: the context's stance is the very pose being edited, replaced on every tick.
    const cam = camera("front");
    let pose: PoseAngles = { ...NEUTRAL_POSE };
    const before = session.solve(pose, { ...CTX, stance: pose });
    const through = before.points.left_knee!.clone();
    const from = toScreen(cam, through, SIZE.w, SIZE.h)!;
    for (let k = 1; k <= 12; k += 1) {
      const at = { x: from.x, y: from.y - (40 * k) / 12 };
      const target = pointerOnCameraPlane(cam, { x: (at.x / SIZE.w) * 2 - 1, y: 1 - (at.y / SIZE.h) * 2 }, through)!;
      pose = dragPoint(session, pose, { ...CTX, stance: pose }, "left_knee", target, { mirror: true, view: target.clone().sub(cam.position).normalize() });
    }
    const after = session.solve(pose, { ...CTX, stance: pose });
    const at = toScreen(cam, after.points.left_knee!, SIZE.w, SIZE.h)!;
    assert.ok(Math.hypot(at.x - from.x, at.y - (from.y - 40)) < 4, `the knee is ${Math.hypot(at.x - from.x, at.y - (from.y - 40)).toFixed(1)} px off the pointer`);
    assert.ok(after.points.head!.distanceTo(before.points.head!) < 0.005, "the head stays");
  });
});

describe("the cost of a leg drag", () => {
  it("draws the pose once per tick; the search asks the body a bounded number of times", () => {
    const { session } = rigs()[0];
    const [solves, probes] = [session.stats.solves, session.stats.probes];
    const ticks = 12;
    pointerDrag(session, NEUTRAL_POSE, "three-quarter", "left_foot", 30, -30, { ticks });
    // One solve of the start pose, one per tick; the release reuses the last.
    assert.equal(session.stats.solves - solves, ticks + 1);
    const perTick = (session.stats.probes - probes) / ticks;
    assert.ok(perTick > 0 && perTick < 400, `${perTick.toFixed(0)} body probes per tick`);
  });
});
