import * as THREE from "three";

/**
 * The body points of the pose editor: what each one is called, which bone it sits on and which
 * lines join them into a stick figure. Pure data and a little camera maths, shared by the 3D
 * stage, the DOM overlay that draws the points and the drag rules.
 */

export const POINT_IDS = [
  "head",
  "chest",
  "hips",
  "left_elbow",
  "right_elbow",
  "left_hand",
  "right_hand",
  "left_knee",
  "right_knee",
  "left_foot",
  "right_foot",
] as const;
export type PointId = (typeof POINT_IDS)[number];

export const POINT_LABEL: Record<PointId, string> = {
  head: "Head",
  chest: "Chest",
  hips: "Hips",
  left_elbow: "Left elbow",
  right_elbow: "Right elbow",
  left_hand: "Left hand",
  right_hand: "Right hand",
  left_knee: "Left knee",
  right_knee: "Right knee",
  left_foot: "Left foot",
  right_foot: "Right foot",
};

/** What a drag of the point moves, in words: shown next to the point and announced. */
export const POINT_HINT: Record<PointId, string> = {
  head: "turns the head",
  chest: "bends the spine",
  hips: "raises, lowers or shifts the pelvis forward and back",
  left_elbow: "swings the upper arm",
  right_elbow: "swings the upper arm",
  left_hand: "moves the arm",
  right_hand: "moves the arm",
  left_knee: "swings the thigh",
  right_knee: "swings the thigh",
  left_foot: "moves the leg",
  right_foot: "moves the leg",
};

export function isPointId(value: unknown): value is PointId {
  return typeof value === "string" && (POINT_IDS as readonly string[]).includes(value);
}

/** The point on the other side of the body (left hand ↔ right hand), or null for a central one. */
export function mirrorPoint(id: PointId): PointId | null {
  if (id.startsWith("left_")) return `right_${id.slice(5)}` as PointId;
  if (id.startsWith("right_")) return `left_${id.slice(6)}` as PointId;
  return null;
}

/** Central points are larger, like the root of a rig: the pelvis carries the body. */
export function pointRole(id: PointId): "root" | "spine" | "limb" {
  if (id === "hips") return "root";
  if (id === "chest" || id === "head") return "spine";
  return "limb";
}

/**
 * Stick-figure lines, as chains of skeleton joints (Mixamo logical names; "HeadCenter" is the
 * head point). The stage resolves them on the avatar's rig and skips joints it does not have.
 */
export const SKELETON_CHAINS: readonly (readonly string[])[] = [
  ["Hips", "Spine", "Spine1", "Spine2", "Neck", "HeadCenter"],
  ["Hips", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"],
  ["Hips", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"],
  ["Neck", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand"],
  ["Neck", "RightShoulder", "RightArm", "RightForeArm", "RightHand"],
];

/** A press that moves less than this many pixels is a click (select), not a drag. */
export const DRAG_SLOP_PX = 3;

/** Arrow-key nudges of the selected point move it in the camera's plane (PageUp / PageDown: depth); sizes in pose-hit.ts. */
export const NUDGE_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"] as const;
export type NudgeKey = (typeof NUDGE_KEYS)[number];

export function isNudgeKey(key: string): key is NudgeKey {
  return (NUDGE_KEYS as readonly string[]).includes(key);
}

/**
 * World offset of one nudge of `step` metres, in the camera's frame: left / right along the
 * screen, up / down along it, PageUp away from the viewer and PageDown towards it.
 */
export function nudgeOffset(camera: THREE.Camera, key: NudgeKey, step: number): THREE.Vector3 {
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const back = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).normalize();
  switch (key) {
    case "ArrowLeft": return right.multiplyScalar(-step);
    case "ArrowRight": return right.multiplyScalar(step);
    case "ArrowUp": return up.multiplyScalar(step);
    case "ArrowDown": return up.multiplyScalar(-step);
    case "PageUp": return back.multiplyScalar(-step);
    case "PageDown": return back.multiplyScalar(step);
  }
}

/**
 * Where the pointer meets the plane facing the camera through `through`: the target of a drag in
 * the camera plane. `ndc` is the pointer in normalised device coordinates (-1..1, y up). Null when
 * the ray runs parallel to the plane.
 */
export function pointerOnCameraPlane(camera: THREE.Camera, ndc: { x: number; y: number }, through: THREE.Vector3): THREE.Vector3 | null {
  camera.updateMatrixWorld();
  const normal = camera.getWorldDirection(new THREE.Vector3());
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, through);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  return ray.ray.intersectPlane(plane, new THREE.Vector3());
}

/** How many metres one CSS pixel spans at `world`, on a viewport `heightPx` tall (perspective or orthographic camera). */
export function metresPerPixel(camera: THREE.Camera, world: THREE.Vector3, heightPx: number): number {
  const ortho = camera as THREE.OrthographicCamera;
  if (ortho.isOrthographicCamera) return (ortho.top - ortho.bottom) / ortho.zoom / Math.max(1, heightPx);
  const persp = camera as THREE.PerspectiveCamera;
  camera.updateMatrixWorld();
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const depth = Math.max(0.01, world.clone().sub(camera.getWorldPosition(new THREE.Vector3())).dot(forward));
  const fov = THREE.MathUtils.degToRad(persp.fov ?? 50);
  return (2 * depth * Math.tan(fov / 2)) / (persp.zoom || 1) / Math.max(1, heightPx);
}

/** Screen position (CSS pixels from the top left of a w × h viewport) of a world point; null behind the camera. */
export function toScreen(camera: THREE.Camera, world: THREE.Vector3, w: number, h: number, out = new THREE.Vector3()): { x: number; y: number } | null {
  out.copy(world).project(camera);
  if (out.z > 1 || out.z < -1) return null;
  return { x: ((out.x + 1) / 2) * w, y: ((1 - out.y) / 2) * h };
}
