"use client";

import { create } from "zustand";
import { createBodyChecksSlice, type BodyChecksSlice } from "./body-checks-slice.ts";
import { createOpenSlice, type OpenSlice } from "./open-slice.ts";
import { createPlaybackSlice, type PlaybackSlice } from "./playback-slice.ts";
import { createPoseSlice, type PoseSlice } from "./pose-slice.ts";
import { createRigSlice, type RigSlice } from "./rig-slice.ts";

export { MAX_POSES, type PoseEditState, type PoseSnapshot } from "./pose-slice.ts";

export { NO_EDIT, type EditMode, type EditState, type EditTool, type SocketDraft } from "./rig-slice.ts";

export { EMPTY_SCENE, type SceneSource } from "./open-slice.ts";

/**
 * Workspace state shared by the three panes. Components subscribe to slices with selectors, so
 * typing in the inspector, scrolling the catalog or a queue refresh never re-renders the 3D
 * canvas: it listens to `scene`, `previewItems`, `equipmentModels` and the view toggles only, and reads the
 * playback controls imperatively inside its frame loop.
 */
export type StudioState = RigSlice & OpenSlice & PlaybackSlice & PoseSlice & BodyChecksSlice;

export const useStudioStore = create<StudioState>((set) => ({
  ...createRigSlice(set),
  ...createOpenSlice(set),
  ...createPlaybackSlice(set),
  ...createPoseSlice(set),
  ...createBodyChecksSlice(set),
}));
