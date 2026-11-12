"use client";

import { create } from "zustand";
import { DEFAULT_VIEW, type CameraViewId } from "./stage-camera.ts";

/**
 * What the stage camera is asked to do and which named view it is on. Apart from the main studio
 * store, so a view change or an orbit never notifies the panels; the camera rig in the canvas
 * carries the requests out (viewer/camera-rig.tsx).
 */
export type ViewRequest =
  /** Turn to a named view and fit the whole body from there. */
  | { kind: "view"; view: CameraViewId }
  /** Fit the body (or the selected point's part) from where the camera looks now. */
  | { kind: "frame" }
  /** Back to the default view, whole body. */
  | { kind: "reset" };

type StageViewState = {
  /** The named view the camera looks from (or is turning to); null once the user orbits away. */
  current: CameraViewId | null;
  request: (ViewRequest & { nonce: number }) | null;
  showView: (view: CameraViewId) => void;
  frame: () => void;
  reset: () => void;
  setCurrent: (view: CameraViewId | null) => void;
};

export const useStageView = create<StageViewState>((set) => ({
  current: DEFAULT_VIEW,
  request: null,
  showView: (view) => set((s) => ({ request: { kind: "view", view, nonce: (s.request?.nonce ?? 0) + 1 } })),
  frame: () => set((s) => ({ request: { kind: "frame", nonce: (s.request?.nonce ?? 0) + 1 } })),
  reset: () => set((s) => ({ request: { kind: "reset", nonce: (s.request?.nonce ?? 0) + 1 } })),
  setCurrent: (current) => set((s) => (s.current === current ? s : { current })),
}));
