/**
 * Where the stage camera goes. The named views and their keys, which view the camera is on, the
 * free part of the stage around its overlays, and the target, distance and screen offset that fit
 * a set of body points inside that free part. Pure arithmetic on plain tuples (no three.js), so
 * the viewer and node:test share it.
 *
 * Conventions: metres, Y up, the avatar faces +Z, so its left side is +X. A direction is the unit
 * vector from the target to the camera. Screen offsets are CSS pixels from the viewport centre to
 * where the target is drawn (the camera's view offset), y down.
 */

import type { PointId } from "./pose-points.ts";

export type Vec3 = readonly [number, number, number];
/** CSS pixels, y down. */
export type Box = { left: number; top: number; right: number; bottom: number };
export type Size = { width: number; height: number };
export type ScreenOffset = { x: number; y: number };

export type CameraViewId = "front" | "three-quarter" | "left" | "right" | "back" | "top";

export type CameraView = {
  id: CameraViewId;
  /** Button text. */
  label: string;
  /** Full name, for titles and screen readers. */
  name: string;
  /** Keyboard shortcut. */
  key: string;
};

/** In key order. 1 to 3 keep the keys the stage had (Front, three-quarter, the left side). */
export const CAMERA_VIEWS: readonly CameraView[] = [
  { id: "front", label: "Front", name: "Front", key: "1" },
  { id: "three-quarter", label: "Angled", name: "Angled ¾", key: "2" },
  { id: "left", label: "Left", name: "Left side", key: "3" },
  { id: "right", label: "Right", name: "Right side", key: "4" },
  { id: "back", label: "Back", name: "Back", key: "5" },
  { id: "top", label: "Top", name: "Top", key: "6" },
];

export const DEFAULT_VIEW: CameraViewId = "three-quarter";

/** The side views look a little down, so the floor reads as a floor and not as a line. */
const ELEVATION = (5 * Math.PI) / 180;
const SIN_E = Math.sin(ELEVATION);
const COS_E = Math.cos(ELEVATION);

const DIRECTIONS: Record<CameraViewId, Vec3> = {
  front: [0, SIN_E, COS_E],
  back: [0, SIN_E, -COS_E],
  left: [COS_E, SIN_E, 0],
  right: [-COS_E, SIN_E, 0],
  // Straight down, nudged towards the front so "up" on screen stays defined (the head points away).
  top: normalize([0, 1, 1e-3]),
  "three-quarter": normalize([3.1, 0.8, 3.5]),
};

export function viewDirection(view: CameraViewId): Vec3 {
  return DIRECTIONS[view];
}

export function viewById(view: CameraViewId): CameraView {
  return CAMERA_VIEWS.find((v) => v.id === view)!;
}

/** The named view the camera looks from, or null once the user orbits away from it. */
export function matchView(direction: Vec3, toleranceDeg = 1.5): CameraViewId | null {
  const d = normalize(direction);
  const cos = Math.cos((toleranceDeg * Math.PI) / 180);
  for (const view of CAMERA_VIEWS) if (dot(d, DIRECTIONS[view.id]) >= cos) return view.id;
  return null;
}

/** The view an end of the axis widget stands for: +X is the avatar's left side; the bottom end has none. */
export function viewOfAxis(axis: Vec3): CameraViewId | null {
  const [x, y, z] = axis;
  if (x > 0.5) return "left";
  if (x < -0.5) return "right";
  if (z > 0.5) return "front";
  if (z < -0.5) return "back";
  if (y > 0.5) return "top";
  return null;
}

/** A body this much lower than it is long lies down (a standing or seated one is taller than wide). */
const LYING_RATIO = 0.65;

/**
 * The side view a lying body (supine, prone, side-lying, a plank) opens from: its profile, so the
 * whole length of the body is read across the screen and not foreshortened from the feet or the
 * head. Null for a body that is not lying, or when the camera already looks at its profile.
 */
export function lyingView(min: Vec3, max: Vec3, current: CameraViewId | null): CameraViewId | null {
  const dx = max[0] - min[0];
  const dz = max[2] - min[2];
  const length = Math.max(dx, dz);
  if (!(length > 0) || max[1] - min[1] >= LYING_RATIO * length) return null;
  // Along Z (the avatar's facing axis) the profile is a side view; along X it is the front or the back.
  const profile: readonly CameraViewId[] = dz >= dx ? ["left", "right"] : ["front", "back"];
  return current && profile.includes(current) ? null : profile[0];
}

/** Ids of the screen points that lie inside any box grown by `pad` pixels. */
export function pointsInside(points: readonly { id: string; x: number; y: number }[], boxes: readonly Box[], pad = 0): string[] {
  return points.filter((p) => boxes.some((b) => p.x > b.left - pad && p.x < b.right + pad && p.y > b.top - pad && p.y < b.bottom + pad)).map((p) => p.id);
}

/** The body points that make the part around a selected point, for framing it (the point first). */
export const PART_POINTS: Record<PointId, readonly PointId[]> = {
  head: ["head", "chest"],
  chest: ["chest", "head", "hips"],
  hips: ["hips", "chest", "left_knee", "right_knee"],
  left_elbow: ["left_elbow", "left_hand", "chest"],
  right_elbow: ["right_elbow", "right_hand", "chest"],
  left_hand: ["left_hand", "left_elbow"],
  right_hand: ["right_hand", "right_elbow"],
  left_knee: ["left_knee", "hips", "left_foot"],
  right_knee: ["right_knee", "hips", "right_foot"],
  left_foot: ["left_foot", "left_knee"],
  right_foot: ["right_foot", "right_knee"],
};

// ---- vectors ------------------------------------------------------------------------------

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
}

/** The camera's right and up axes for a direction, as a Y-up lookAt builds them. */
export function viewBasis(direction: Vec3): { right: Vec3; up: Vec3; back: Vec3 } {
  const back = normalize(direction);
  let right = cross([0, 1, 0], back);
  right = Math.hypot(...right) < 1e-9 ? [1, 0, 0] : normalize(right);
  return { right, up: cross(back, right), back };
}

/** Centre of the axis-aligned box around the points. */
export function boxCentre(points: readonly Vec3[]): Vec3 {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let i = 0; i < 3; i += 1) {
      lo[i] = Math.min(lo[i], p[i]);
      hi[i] = Math.max(hi[i], p[i]);
    }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
}

// ---- what a frame from above keeps room for --------------------------------------------------

/** A camera this close to straight down (11°) looks from the top: the top view, or an orbit right next to it. */
const FROM_ABOVE_Y = 0.98;
/** The arms reach about this share of the body's length from its middle (a standing 1.75 m body: 0.77 m)... */
const REACH_SHARE = 0.44;
/** ...at about shoulder height: this share of the body's height below its top. */
const SHOULDER_DROP = 0.17;
const RING_STEPS = 12;

/**
 * The points to frame from `direction`. From above, the body is near the camera and seen in strong
 * perspective: a hand raised or swung out comes much closer and leaves a frame fitted to the pose
 * as it is. So from above the frame also keeps room for a ring the arms can reach, at about
 * shoulder height, around its middle (about as wide as the body is long, standing or lying). From any other
 * side, the points themselves.
 */
export function framingPoints(points: readonly Vec3[], direction: Vec3): Vec3[] {
  if (!points.length || normalize(direction)[1] < FROM_ABOVE_Y) return [...points];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let i = 0; i < 3; i += 1) {
      lo[i] = Math.min(lo[i], p[i]);
      hi[i] = Math.max(hi[i], p[i]);
    }
  const radius = REACH_SHARE * Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const cx = (lo[0] + hi[0]) / 2;
  const cz = (lo[2] + hi[2]) / 2;
  const y = hi[1] - SHOULDER_DROP * (hi[1] - lo[1]);
  const ring: Vec3[] = [];
  for (let i = 0; i < RING_STEPS; i += 1) {
    const a = (i / RING_STEPS) * 2 * Math.PI;
    ring.push([cx + radius * Math.cos(a), y, cz + radius * Math.sin(a)]);
  }
  return [...points, ...ring];
}

// ---- the camera as orbit values -------------------------------------------------------------

/** A camera around a target: what the stage eases between. Azimuth from +Z towards +X, polar from +Y. */
export type CameraPose = { target: Vec3; azimuth: number; polar: number; distance: number; offset: ScreenOffset };

export function orbitOf(direction: Vec3): { azimuth: number; polar: number } {
  const d = normalize(direction);
  return { azimuth: Math.atan2(d[0], d[2]), polar: Math.acos(Math.max(-1, Math.min(1, d[1]))) };
}

export function directionOf(pose: Pick<CameraPose, "azimuth" | "polar">): Vec3 {
  const s = Math.sin(pose.polar);
  return [s * Math.sin(pose.azimuth), Math.cos(pose.polar), s * Math.cos(pose.azimuth)];
}

export function positionOf(pose: CameraPose): Vec3 {
  return add(pose.target, scale(directionOf(pose), pose.distance));
}

/** In between two cameras: around the target (never through the body), the short way round, distance on a log scale. */
export function interpolatePose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const k = Math.max(0, Math.min(1, t));
  let turn = b.azimuth - a.azimuth;
  turn = ((((turn + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  const lerp = (x: number, y: number) => x + (y - x) * k;
  return {
    target: [lerp(a.target[0], b.target[0]), lerp(a.target[1], b.target[1]), lerp(a.target[2], b.target[2])],
    azimuth: a.azimuth + turn * k,
    polar: lerp(a.polar, b.polar),
    distance: Math.exp(lerp(Math.log(a.distance), Math.log(b.distance))),
    offset: { x: lerp(a.offset.x, b.offset.x), y: lerp(a.offset.y, b.offset.y) },
  };
}

export function easeOutCubic(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return 1 - (1 - k) ** 3;
}

/** Where a world point is drawn (CSS pixels from the viewport's top left), or null behind the camera. */
export function projectPoint(pose: CameraPose, point: Vec3, fovYDeg: number, viewport: Size): { x: number; y: number } | null {
  const dir = directionOf(pose);
  const { right, up, back } = viewBasis(dir);
  const rel = sub(point, positionOf(pose));
  const depth = -dot(rel, back);
  if (depth <= 1e-6) return null;
  const f = viewport.height / 2 / Math.tan((fovYDeg * Math.PI) / 360);
  return {
    x: viewport.width / 2 + pose.offset.x + (f * dot(rel, right)) / depth,
    y: viewport.height / 2 + pose.offset.y - (f * dot(rel, up)) / depth,
  };
}

// ---- the free part of the stage -------------------------------------------------------------

const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const contains = (a: Box, b: Box) => a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom;

/**
 * The largest rectangles of the stage that no overlay covers (each one maximal: it cannot grow
 * without running into an overlay or the stage edge), at least `min` pixels on each side.
 * Overlays are few (status cards, the legend, the axis widget, the bottom bars, a card), so every
 * rectangle between their edges is tried.
 */
export function freeAreas(stage: Box, obstacles: readonly Box[], min = 120): Box[] {
  const clipped = obstacles
    .map((o) => ({ left: Math.max(stage.left, o.left), top: Math.max(stage.top, o.top), right: Math.min(stage.right, o.right), bottom: Math.min(stage.bottom, o.bottom) }))
    .filter((o) => o.right > o.left && o.bottom > o.top);
  const xs = [...new Set([stage.left, stage.right, ...clipped.flatMap((o) => [o.left, o.right])])].sort((a, b) => a - b);
  const ys = [...new Set([stage.top, stage.bottom, ...clipped.flatMap((o) => [o.top, o.bottom])])].sort((a, b) => a - b);
  const found: Box[] = [];
  for (let i = 0; i < xs.length; i += 1)
    for (let j = i + 1; j < xs.length; j += 1) {
      if (xs[j] - xs[i] < min) continue;
      for (let k = 0; k < ys.length; k += 1)
        for (let l = k + 1; l < ys.length; l += 1) {
          if (ys[l] - ys[k] < min) continue;
          const box = { left: xs[i], right: xs[j], top: ys[k], bottom: ys[l] };
          if (!clipped.some((o) => overlaps(o, box))) found.push(box);
        }
    }
  return found.filter((a) => !found.some((b) => b !== a && contains(b, a) && !contains(a, b)));
}

// ---- framing --------------------------------------------------------------------------------

export type FrameInput = {
  /** The points to show (world, metres): the body's surface, or the part around a selected point. */
  points: readonly Vec3[];
  direction: Vec3;
  fovYDeg: number;
  viewport: Size;
  /** Room around each point, metres. */
  padM?: number;
  /** Room inside the free area's edges, CSS pixels. */
  marginPx?: number;
  /** Show at least this much around the points' centre, metres (a selected hand keeps its forearm and some body around it). */
  minRadiusM?: number;
  minDistance?: number;
  maxDistance?: number;
};

/**
 * The camera that shows every point inside `area` from `direction`: the target is the centre of
 * the points and is drawn at the area's centre (screen offset), and the distance is the smallest
 * that keeps each point, with its padding, inside the area.
 */
export function fitInArea(input: FrameInput, area: Box): CameraPose {
  const { points, direction, fovYDeg, viewport, padM = 0.05, marginPx = 16, minRadiusM = 0, minDistance = 0.3, maxDistance = 50 } = input;
  const target = points.length ? boxCentre(points) : ([0, 0.9, 0] as Vec3);
  const { right, up, back } = viewBasis(direction);
  const f = viewport.height / 2 / Math.tan((fovYDeg * Math.PI) / 360);
  const halfW = Math.max(8, (area.right - area.left) / 2 - marginPx);
  const halfH = Math.max(8, (area.bottom - area.top) / 2 - marginPx);
  let distance = Math.max(minDistance, (minRadiusM * f) / halfW, (minRadiusM * f) / halfH);
  for (const p of points) {
    const rel = sub(p, target);
    // Nearer points are drawn larger: depth counts towards the camera with the padding.
    const z = dot(rel, back) + padM;
    distance = Math.max(distance, z + ((Math.abs(dot(rel, right)) + padM) * f) / halfW, z + ((Math.abs(dot(rel, up)) + padM) * f) / halfH);
  }
  const { azimuth, polar } = orbitOf(direction);
  return {
    target,
    azimuth,
    polar,
    distance: Math.min(maxDistance, distance),
    offset: { x: (area.left + area.right) / 2 - viewport.width / 2, y: (area.top + area.bottom) / 2 - viewport.height / 2 },
  };
}

/** A free area that draws the body at least this share of the largest size still counts as "as good". */
const NEAR_BEST = 0.8;

/**
 * Frame the points in the free part of the stage. Of the free areas around the overlays, those
 * where the points are drawn nearly as large as they can be (within NEAR_BEST of the nearest
 * camera), the one nearest the stage's centre: a body is not pushed into a thin strip by an edge
 * for a few more pixels. Without any free area, the whole stage.
 */
export function frameInStage(input: FrameInput, obstacles: readonly Box[], minArea = 160): CameraPose & { area: Box } {
  const stage: Box = { left: 0, top: 0, right: input.viewport.width, bottom: input.viewport.height };
  const areas = freeAreas(stage, obstacles, Math.min(minArea, input.viewport.width / 3, input.viewport.height / 3));
  const fits = (areas.length ? areas : [stage]).map((area) => ({ ...fitInArea(input, area), area }));
  const nearest = Math.min(...fits.map((f) => f.distance));
  const cx = stage.right / 2;
  const cy = stage.bottom / 2;
  const offCentre = (a: Box) => Math.hypot((a.left + a.right) / 2 - cx, (a.top + a.bottom) / 2 - cy);
  return fits.filter((f) => nearest / f.distance >= NEAR_BEST - 1e-9).sort((a, b) => offCentre(a.area) - offCentre(b.area) || a.distance - b.distance)[0];
}
