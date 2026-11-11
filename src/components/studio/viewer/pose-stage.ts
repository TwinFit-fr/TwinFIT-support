"use client";

import type { NudgeKey, PointId } from "@/lib/studio/pose-points";
import type { SettingsApplied } from "../hooks/use-template-settings";

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
  /** The same joints by logical name ("LeftForeArm"), for marking the one a panel control turns. */
  joints: Record<string, ScreenXY>;
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

/** What an Exercise-mode drag is doing, for the stage to say while it happens. */
export type ExerciseStatus =
  | {
      kind: "live";
      id: PointId;
      /** The setting followed ("Range") and its nearest choice ("Deep"); null until the pointer moves. */
      setting: string | null;
      value: string | null;
      /** Every choice of that setting, in order, and the nearest one's index. */
      options: string[];
      index: number;
      /** The nearest choice is not the one the poses had. */
      changed: boolean;
      /** The pointer asks for something no setting does. */
      off: boolean;
      /** The pointer is past the last choice: as far as the setting goes. */
      limit: boolean;
      /** Set when the drag moved to another pose (no setting moves this point in the one on the stage): "the bottom pose". */
      pose: string | null;
      /** What a change replaces besides the template's poses, in words ("replaces your edits"); null: nothing. */
      replaces: string | null;
    }
  /** No setting moves this point in any pose of the exercise. */
  | { kind: "none"; id: PointId; label: string };

export type StageLayer = {
  frame: (frame: StageFrame | null) => void;
  setAvailable: (ids: PointId[]) => void;
  announce: (message: string) => void;
  /** The point being dragged, with what there is to say about how it moves (see legNote). */
  setDragging: (id: PointId | null, note?: { text: string; moves: boolean } | null) => void;
  /** An Exercise-mode drag's state (null: none). */
  exercise: (status: ExerciseStatus | null) => void;
  /** An Exercise-mode drag was released: what it applied (null result: nothing changed). */
  exerciseDone: (done: { id: PointId; result: SettingsApplied | null; setting: string | null; value: string | null }) => void;
};

/** The joint a properties control turns, marked on the stage while the control is hovered or focused. */
export type StageLink = { bones: string[]; label: string };

export const poseStage: { scene: StageScene | null; layer: StageLayer | null; available: PointId[]; link: StageLink | null } = { scene: null, layer: null, available: [], link: null };

/** Mark (or, with null, unmark) the joint a control turns; the layer draws it on its next frame. */
export function linkJoint(link: StageLink | null): void {
  poseStage.link = link;
}
