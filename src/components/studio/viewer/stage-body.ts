"use client";

import * as THREE from "three";
import type { Box, Vec3 } from "@/lib/studio/stage-camera";

/**
 * The avatar on the stage, for the camera to frame. The model sets it; `version` moves when what
 * the body shows changes (another avatar or clip, the pose editor opened), so the camera can
 * frame the new body once it is drawn. Read in the frame loop, never through React.
 */
export const stageBody: { model: THREE.Object3D | null; version: number } = { model: null, version: 0 };

export function showBody(model: THREE.Object3D | null): void {
  stageBody.model = model;
  stageBody.version += 1;
}

/** Vertices read per mesh: enough for the silhouette (hands, feet, the top of the head), cheap to skin. */
const SAMPLES_PER_MESH = 600;
const meshesOf = new WeakMap<THREE.Object3D, THREE.Mesh[]>();

/** The avatar's own meshes: the skinned ones (equipment hung on the bones is not skinned), else every mesh. */
function bodyMeshes(model: THREE.Object3D): THREE.Mesh[] {
  let list = meshesOf.get(model);
  if (!list) {
    const skinned: THREE.Mesh[] = [];
    const plain: THREE.Mesh[] = [];
    model.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.Mesh);
      else if ((o as THREE.Mesh).isMesh) plain.push(o as THREE.Mesh);
    });
    list = skinned.length ? skinned : plain;
    meshesOf.set(model, list);
  }
  return list;
}

const vertex = new THREE.Vector3();

/** Points on the body's surface as it is drawn now (skinned), world metres; empty without a model. */
export function bodySurface(model: THREE.Object3D | null = stageBody.model): Vec3[] {
  if (!model) return [];
  const out: Vec3[] = [];
  for (const mesh of bodyMeshes(model)) {
    const position = mesh.geometry?.getAttribute("position");
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    const step = Math.max(1, Math.floor(position.count / SAMPLES_PER_MESH));
    for (let i = 0; i < position.count; i += step) {
      mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
      if (Number.isFinite(vertex.x + vertex.y + vertex.z)) out.push([vertex.x, vertex.y, vertex.z]);
    }
  }
  return out;
}

/** The axis-aligned box around points, as min and max corners. */
export function boundsOf(points: readonly Vec3[]): { min: Vec3; max: Vec3 } | null {
  if (!points.length) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  return { min: min as unknown as Vec3, max: max as unknown as Vec3 };
}

/** The eight corners of a box. */
export function cornersOf(b: { min: Vec3; max: Vec3 }): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}

/** Gap kept between the body and an overlay, CSS pixels. */
const OVERLAY_GAP = 8;
/** The axis widget's corner (top right; GizmoHelper-like margin of 64 px around its centre). */
export const AXIS_WIDGET_PX = 128;

/**
 * What covers the stage, in CSS pixels from the canvas's top left: the status cards, the legend,
 * the bottom bars, the reference card, the Rig editor button (anything glass or marked
 * data-stage-obstacle) and the axis widget. The body points and the body-check marks are not overlays.
 */
export function stageObstacles(canvas: HTMLElement): Box[] {
  const c = canvas.getBoundingClientRect();
  // The stage pane: the 3D view's own overlays and what the workspace lays over it (the Rig editor button).
  const pane = canvas.closest(".stage-frame")?.parentElement;
  const out: Box[] = [{ left: c.width - AXIS_WIDGET_PX, top: 0, right: c.width, bottom: AXIS_WIDGET_PX }];
  if (!pane) return out;
  for (const el of pane.querySelectorAll<HTMLElement>(".stage-hud > *, .studio-glass, [data-stage-obstacle]")) {
    if (el.closest(".pose-points, .body-marks")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || getComputedStyle(el).visibility === "hidden") continue;
    out.push({ left: r.left - c.left - OVERLAY_GAP, top: r.top - c.top - OVERLAY_GAP, right: r.right - c.left + OVERLAY_GAP, bottom: r.bottom - c.top + OVERLAY_GAP });
  }
  return out;
}
