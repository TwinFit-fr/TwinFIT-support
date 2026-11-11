"use client";

import type { NudgeKey, PointId } from "@/lib/studio/pose-points";

/**
 * The link between the 3D scene and the DOM layer that draws the body points over it. The scene
 * projects the points every frame and hands them to the layer; the layer turns pointer and key
 * input into drags, which the scene applies on its next frame. Neither re-renders the other.
 */

export type ScreenXY = { x: number; y: number };

export type StageFrame = {
  /** CSS pixels from the top left of the canvas; a point missing here is hidden (behind the camera). */
  points: Partial<Record<PointId, ScreenXY>>;
  /** Stick-figure polylines, CSS pixels. */
  chains: ScreenXY[][];
  /** While a dragged point cannot follow the pointer: from the point to where the pointer asks it to be. */
  short?: { from: ScreenXY; to: ScreenXY };
};

export type StageScene = {
  /** Start dragging a point (selects it, pauses playback, opens one undo step). `at` is the pointer, CSS pixels on the canvas. */
  beginDrag: (id: PointId, at: ScreenXY) => void;
  /** Latest pointer position of the drag; applied once on the next frame. */
  dragTo: (at: ScreenXY) => void;
  endDrag: () => void;
  /** Move the selected point one step with the keyboard (one undo step per key hold). */
  nudge: (id: PointId, key: NudgeKey, coarse: boolean) => void;
  endNudge: () => void;
  /** True while the pointer is on the axis gizmo or dragging it (a click there is not a click on empty space). */
  gizmoBusy: () => boolean;
};

export type StageLayer = {
  frame: (frame: StageFrame | null) => void;
  setAvailable: (ids: PointId[]) => void;
  announce: (message: string) => void;
  /** The point being dragged, with what there is to say about how it moves (see legNote). */
  setDragging: (id: PointId | null, note?: { text: string; moves: boolean } | null) => void;
};

export const poseStage: { scene: StageScene | null; layer: StageLayer | null; available: PointId[] } = { scene: null, layer: null, available: [] };
