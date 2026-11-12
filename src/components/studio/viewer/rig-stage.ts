"use client";

import type * as THREE from "three";
import { create } from "zustand";
import type { SocketOrigin } from "@/lib/studio/rig-points";
import type { NudgeKey } from "@/lib/studio/pose-points";
import type { ScreenXY } from "./pose-stage";

/**
 * The link between the 3D scene and the DOM layer that draws the rig editor's points over it,
 * the same split as the pose editor's (pose-stage.ts): the scene projects the attachment points
 * (or the equipment placements) every frame and hands them to the layer; the layer turns pointer
 * and key input into drags, which the scene applies on its next frame. Neither re-renders the other.
 */

/** One point the rig editor can move: an attachment point (socket id) or an equipment placement (`kind:code`). */
export type RigPointInfo = {
  id: string;
  /** "Left hand", "Dumbbell". */
  label: string;
  /** Where it comes from (sockets only; null for an equipment placement). */
  origin: SocketOrigin | null;
};

export type RigFrame = {
  /** CSS pixels from the top left of the canvas, by point id; a point missing here is hidden. */
  points: Record<string, ScreenXY>;
};

export type RigScene = {
  /** Start dragging a point in the camera's plane (one undo step). `at` is the pointer, CSS pixels on the canvas. */
  beginDrag: (id: string, at: ScreenXY) => void;
  /** Latest pointer position of the drag; applied once on the next frame. */
  dragTo: (at: ScreenXY) => void;
  endDrag: () => void;
  /** Move the selected point one step with the keyboard (one undo step per key hold). */
  nudge: (id: string, key: NudgeKey, coarse: boolean) => void;
  endNudge: () => void;
};

export type RigLayer = {
  frame: (frame: RigFrame | null) => void;
  announce: (message: string) => void;
  setDragging: (id: string | null) => void;
};

/** The scene objects the points stand for, by id: the group whose position and rotation a point's numbers are. */
export const rigStage: { scene: RigScene | null; layer: RigLayer | null; targets: Map<string, THREE.Object3D> } = {
  scene: null,
  layer: null,
  targets: new Map(),
};

const refs = new Map<string, (o: THREE.Object3D | null) => void>();

/** A stable callback ref that registers the scene object of point `id` (and forgets it when it goes). */
export function rigTargetRef(id: string): (o: THREE.Object3D | null) => void {
  let ref = refs.get(id);
  if (!ref) {
    let mine: THREE.Object3D | null = null;
    ref = (o) => {
      if (o) {
        mine = o;
        rigStage.targets.set(id, o);
      } else if (mine && rigStage.targets.get(id) === mine) {
        rigStage.targets.delete(id);
        mine = null;
      }
    };
    refs.set(id, ref);
  }
  return ref;
}

/** The points the rig editor shows, published by its panel (which knows the avatar) for the layer on the stage. */
export const useRigPoints = create<{ points: RigPointInfo[]; setPoints: (points: RigPointInfo[]) => void }>((set) => ({
  points: [],
  setPoints: (points) => set((s) => (JSON.stringify(s.points) === JSON.stringify(points) ? s : { points })),
}));
