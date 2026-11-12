import assert from "node:assert/strict";
import { POINT_IDS } from "./pose-points.ts";
import { describe, it } from "node:test";
import {
  CAMERA_VIEWS,
  PART_POINTS,
  directionOf,
  easeOutCubic,
  fitInArea,
  frameInStage,
  framingPoints,
  freeAreas,
  interpolatePose,
  matchView,
  orbitOf,
  positionOf,
  projectPoint,
  viewBasis,
  viewDirection,
  viewOfAxis,
  type Box,
  type CameraPose,
  type Vec3,
} from "./stage-camera.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

/** A standing body, 1.75 m: head, shoulders, hands, hips, knees, feet. */
const STANDING: Vec3[] = [
  [0, 1.75, 0],
  [-0.2, 1.45, 0],
  [0.2, 1.45, 0],
  [-0.3, 0.85, 0.05],
  [0.3, 0.85, 0.05],
  [0, 0.95, 0],
  [-0.1, 0.5, 0.05],
  [0.1, 0.5, 0.05],
  [-0.12, 0.02, 0.1],
  [0.12, 0.02, 0.1],
];
/** The same body lying on its back along Z, head towards -Z. */
const LYING: Vec3[] = STANDING.map(([x, y, z]) => [x, 0.12 + z, 0.9 - y] as Vec3);

const VIEWPORT = { width: 860, height: 708 };
const FOV = 38;
/** Status cards top left, the axis widget top right, the bottom bars. */
const OBSTACLES: Box[] = [
  { left: 16, top: 16, right: 330, bottom: 265 },
  { left: 732, top: 0, right: 860, bottom: 128 },
  { left: 190, top: 590, right: 670, bottom: 700 },
];

function inside(pose: CameraPose, points: Vec3[], area: Box) {
  for (const p of points) {
    const s = projectPoint(pose, p, FOV, VIEWPORT);
    assert.ok(s, "a point is behind the camera");
    assert.ok(s.x >= area.left - 1e-6 && s.x <= area.right + 1e-6 && s.y >= area.top - 1e-6 && s.y <= area.bottom + 1e-6, `point ${p} drawn at ${s.x},${s.y} outside ${JSON.stringify(area)}`);
  }
}

describe("stage views", () => {
  it("has six views with distinct keys 1 to 6, front and three-quarter on the keys they had", () => {
    assert.deepEqual(
      CAMERA_VIEWS.map((v) => v.key),
      ["1", "2", "3", "4", "5", "6"],
    );
    assert.deepEqual(
      CAMERA_VIEWS.map((v) => v.id).sort(),
      ["back", "front", "left", "right", "three-quarter", "top"],
    );
    assert.equal(CAMERA_VIEWS[0].id, "front");
    assert.equal(CAMERA_VIEWS[1].id, "three-quarter");
  });

  it("puts the front camera in front of the avatar (+Z), the left one on its left (+X), the top one above", () => {
    assert.ok(viewDirection("front")[2] > 0.99);
    assert.ok(viewDirection("back")[2] < -0.99);
    assert.ok(viewDirection("left")[0] > 0.99);
    assert.ok(viewDirection("right")[0] < -0.99);
    assert.ok(viewDirection("top")[1] > 0.999);
    for (const v of CAMERA_VIEWS) near(Math.hypot(...viewDirection(v.id)), 1);
  });

  it("recognises the view the camera is on, and none once it orbits away", () => {
    for (const v of CAMERA_VIEWS) assert.equal(matchView(viewDirection(v.id)), v.id);
    const front = viewDirection("front");
    assert.equal(matchView([front[0] + 0.2, front[1], front[2]]), null);
    // A camera only a little higher than the side views is not on any of them.
    assert.equal(matchView([0, 0.3, 0.95]), null);
  });

  it("maps the axis widget's ends to views; the bottom end has none", () => {
    assert.equal(viewOfAxis([1, 0, 0]), "left");
    assert.equal(viewOfAxis([-1, 0, 0]), "right");
    assert.equal(viewOfAxis([0, 0, 1]), "front");
    assert.equal(viewOfAxis([0, 0, -1]), "back");
    assert.equal(viewOfAxis([0, 1, 0]), "top");
    assert.equal(viewOfAxis([0, -1, 0]), null);
  });

  it("names a part for every body point, starting with the point itself", () => {
    for (const id of POINT_IDS) {
      assert.equal(PART_POINTS[id][0], id);
      assert.ok(PART_POINTS[id].length >= 2);
    }
  });

  it("builds a right-handed basis whose right axis is horizontal, also looking straight down", () => {
    for (const v of CAMERA_VIEWS) {
      const { right, up, back } = viewBasis(viewDirection(v.id));
      near(right[1], 0);
      near(right[0] * up[0] + right[1] * up[1] + right[2] * up[2], 0);
      near(back[0] * up[0] + back[1] * up[1] + back[2] * up[2], 0);
    }
    // From above, screen right is the avatar's left (+X) and screen up is away from its front (-Z).
    const top = viewBasis(viewDirection("top"));
    assert.ok(top.right[0] > 0.99);
    assert.ok(top.up[2] < -0.99);
  });

  it("round-trips a direction through azimuth and polar", () => {
    for (const v of CAMERA_VIEWS) {
      const d = directionOf(orbitOf(viewDirection(v.id)));
      viewDirection(v.id).forEach((c, i) => near(d[i], c, 1e-9));
    }
  });
});

describe("free part of the stage", () => {
  it("is the whole stage with nothing on it", () => {
    assert.deepEqual(freeAreas({ left: 0, top: 0, right: 800, bottom: 600 }, []), [{ left: 0, top: 0, right: 800, bottom: 600 }]);
  });

  it("finds the maximal rectangles around the overlays, none of them covered", () => {
    const stage = { left: 0, top: 0, right: VIEWPORT.width, bottom: VIEWPORT.height };
    const areas = freeAreas(stage, OBSTACLES);
    assert.ok(areas.length >= 2);
    for (const a of areas) for (const o of OBSTACLES) assert.ok(!(a.left < o.right && a.right > o.left && a.top < o.bottom && a.bottom > o.top), "an area runs under an overlay");
    // Right of the status cards down to the bars, and under the cards across the whole width.
    assert.ok(areas.some((a) => a.left === 330 && a.right === 732 && a.top === 0 && a.bottom === 590));
    assert.ok(areas.some((a) => a.left === 0 && a.right === 860 && a.top === 265 && a.bottom === 590));
  });

  it("ignores overlays outside the stage and areas thinner than the minimum", () => {
    const stage = { left: 0, top: 0, right: 400, bottom: 400 };
    assert.deepEqual(freeAreas(stage, [{ left: 500, top: 0, right: 600, bottom: 100 }]), [stage]);
    assert.deepEqual(freeAreas(stage, [{ left: 0, top: 0, right: 350, bottom: 400 }], 100), []);
  });
});

describe("framing", () => {
  it("fits a standing body inside a free area and draws its centre at the area's centre", () => {
    const area = { left: 330, top: 0, right: 732, bottom: 590 };
    const pose = fitInArea({ points: STANDING, direction: viewDirection("front"), fovYDeg: FOV, viewport: VIEWPORT, marginPx: 16 }, area);
    inside(pose, STANDING, { left: area.left + 16, top: area.top + 16, right: area.right - 16, bottom: area.bottom - 16 });
    const c = projectPoint(pose, pose.target, FOV, VIEWPORT)!;
    near(c.x, (area.left + area.right) / 2, 1e-6);
    near(c.y, (area.top + area.bottom) / 2, 1e-6);
    // Tight: the body fills most of the area's height.
    const ys = STANDING.map((p) => projectPoint(pose, p, FOV, VIEWPORT)!.y);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 0.7 * (area.bottom - area.top - 32));
  });

  it("aims at the body's centre, low for a lying body, not at a standing height", () => {
    const pose = fitInArea({ points: LYING, direction: viewDirection("three-quarter"), fovYDeg: FOV, viewport: VIEWPORT }, { left: 0, top: 0, right: 860, bottom: 708 });
    assert.ok(pose.target[1] < 0.3, `target at ${pose.target[1]} m`);
  });

  it("frames clear of every overlay from each view, for a standing and a lying body", () => {
    for (const body of [STANDING, LYING])
      for (const v of CAMERA_VIEWS) {
        const pose = frameInStage({ points: body, direction: viewDirection(v.id), fovYDeg: FOV, viewport: VIEWPORT, padM: 0.05, marginPx: 12 }, OBSTACLES);
        const drawn = body.map((p) => projectPoint(pose, p, FOV, VIEWPORT)!);
        for (const s of drawn) for (const o of OBSTACLES) assert.ok(!(s.x > o.left && s.x < o.right && s.y > o.top && s.y < o.bottom), `${v.id}: a point is drawn under an overlay`);
        inside(pose, body, pose.area);
      }
  });

  it("picks the tall free area for a standing body and the wide one for a lying body seen from the side", () => {
    const standing = frameInStage({ points: STANDING, direction: viewDirection("front"), fovYDeg: FOV, viewport: VIEWPORT }, OBSTACLES);
    const lying = frameInStage({ points: LYING, direction: viewDirection("left"), fovYDeg: FOV, viewport: VIEWPORT }, OBSTACLES);
    assert.ok(standing.area.bottom - standing.area.top > standing.area.right - standing.area.left);
    assert.ok(lying.area.right - lying.area.left > lying.area.bottom - lying.area.top);
  });

  it("does not push the body into a thin strip by an edge for a few more pixels", () => {
    // A strip right of the bottom bars, under a button at the top right, as tall as the stage.
    const obstacles: Box[] = [...OBSTACLES, { left: 735, top: 120, right: 845, bottom: 170 }, { left: 160, top: 630, right: 700, bottom: 700 }];
    const pose = frameInStage({ points: STANDING, direction: viewDirection("left"), fovYDeg: FOV, viewport: VIEWPORT }, obstacles);
    assert.ok(pose.area.right - pose.area.left > 300, JSON.stringify(pose.area));
    const c = projectPoint(pose, pose.target, FOV, VIEWPORT)!;
    assert.ok(c.x > 250 && c.x < 650, `centre drawn at x ${c.x}`);
  });

  it("from above keeps room for the arms: hands raised out to the sides stay in a frame fitted to them hanging", () => {
    const top = viewDirection("top");
    const area: Box = { left: 0, top: 0, right: 860, bottom: 708 };
    const pose = fitInArea({ points: framingPoints(STANDING, top), direction: top, fovYDeg: FOV, viewport: VIEWPORT }, area);
    // Lateral raise at the top: both hands out at shoulder height, 0.75 m from the middle; a hand raised overhead.
    const raised: Vec3[] = [...STANDING, [-0.75, 1.45, 0], [0.75, 1.45, 0], [0.2, 2.15, 0.05]];
    inside(pose, raised, area);
    // Without the ring the hands out to the sides would leave the frame.
    const tight = fitInArea({ points: STANDING, direction: top, fovYDeg: FOV, viewport: VIEWPORT }, area);
    assert.ok(raised.some((p) => { const s = projectPoint(tight, p, FOV, VIEWPORT); return !s || s.x < 0 || s.x > 860 || s.y < 0 || s.y > 708; }));
  });

  it("frames the points as they are from every side but above, and a lying body from above too", () => {
    for (const v of CAMERA_VIEWS.filter((c) => c.id !== "top")) assert.equal(framingPoints(STANDING, viewDirection(v.id)).length, STANDING.length);
    // An orbit looking down steeply (30° from straight down) still fits the body itself: F fills the stage with it.
    assert.equal(framingPoints(STANDING, [0, Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]).length, STANDING.length);
    const lying = framingPoints(LYING, viewDirection("top"));
    assert.ok(lying.length > LYING.length);
    // The ring is about as wide as the lying body is long, around its middle.
    const extra = lying.slice(LYING.length);
    const xs = extra.map((p) => p[0]);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 1.4 && Math.max(...xs) - Math.min(...xs) < 1.8);
    assert.deepEqual(framingPoints([], viewDirection("top")), []);
  });

  it("comes closer for a part than for the whole body, and respects the distance limits", () => {
    const hand: Vec3[] = [
      [0.3, 0.85, 0.05],
      [0.25, 1.15, 0.0],
    ];
    const input = { direction: viewDirection("front"), fovYDeg: FOV, viewport: VIEWPORT, padM: 0.12 };
    const body = frameInStage({ ...input, points: STANDING }, OBSTACLES);
    const part = frameInStage({ ...input, points: hand }, OBSTACLES);
    assert.ok(part.distance < body.distance);
    // Never closer than showing 0.35 m around the part's centre: the area's half height holds at least that.
    const wide = frameInStage({ ...input, points: hand, minRadiusM: 0.35 }, OBSTACLES);
    assert.ok(wide.distance > part.distance);
    const top = projectPoint(wide, [wide.target[0], wide.target[1] + 0.35, wide.target[2]], FOV, VIEWPORT)!;
    assert.ok(top.y >= wide.area.top - 1e-6);
    assert.ok(frameInStage({ ...input, points: hand, minDistance: 0.8 }, OBSTACLES).distance >= 0.8);
    assert.ok(frameInStage({ ...input, points: STANDING, maxDistance: 1 }, OBSTACLES).distance <= 1);
  });
});

describe("easing between views", () => {
  const front: CameraPose = { target: [0, 0.9, 0], ...orbitOf(viewDirection("front")), distance: 4, offset: { x: 0, y: 0 } };
  const back: CameraPose = { target: [0, 0.2, 0.3], ...orbitOf(viewDirection("back")), distance: 2, offset: { x: 40, y: -20 } };

  it("starts and ends exactly on the two cameras", () => {
    assert.deepEqual(interpolatePose(front, back, 0), { ...front, target: [...front.target] });
    const end = interpolatePose(front, back, 1);
    near(Math.cos(end.azimuth), Math.cos(back.azimuth));
    near(Math.sin(end.azimuth), Math.sin(back.azimuth));
    near(end.distance, 2);
    assert.deepEqual(end.offset, back.offset);
  });

  it("turns around the target, never through the body, the short way round", () => {
    for (let t = 0; t <= 1; t += 0.1) {
      const p = interpolatePose(front, back, t);
      const pos = positionOf(p);
      const d = Math.hypot(pos[0] - p.target[0], pos[1] - p.target[1], pos[2] - p.target[2]);
      assert.ok(d >= 2 - 1e-9 && d <= 4 + 1e-9);
    }
    const left: CameraPose = { ...front, ...orbitOf(viewDirection("left")) };
    const right: CameraPose = { ...front, ...orbitOf(viewDirection("right")) };
    // Left (+90°) to front (0°) turns 90°, not 270°.
    near(Math.abs(interpolatePose(left, front, 0.5).azimuth - Math.PI / 4), 0, 1e-9);
    // Half way from the left side to the right side is front or back, at the same height.
    const half = directionOf(interpolatePose(left, right, 0.5));
    near(Math.abs(half[2]), Math.cos((5 * Math.PI) / 180), 1e-9);
  });

  it("eases out: fast at first, settling at the end", () => {
    near(easeOutCubic(0), 0);
    near(easeOutCubic(1), 1);
    assert.ok(easeOutCubic(0.5) > 0.8);
    near(easeOutCubic(2), 1);
  });
});
