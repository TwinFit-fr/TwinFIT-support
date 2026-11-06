"use client";

import { create } from "zustand";
import type { AvatarSocket, EquipmentItem, VectorFormat, VectorStatus } from "./types";

export type CameraPreset = "front" | "three-quarter" | "side";

/**
 * What the 3D scene needs, and nothing else: primitives plus the socket list, derived by the
 * workspace from the SWR data. It is replaced only when a field really changes, so polling the
 * queue every few seconds (new row objects, same values) never reaches the canvas.
 */
export type SceneSource = {
  avatarId: string | null;
  avatarName: string | null;
  rig: string | null;
  modelUrl: string | null;
  heightM: number | null;
  sockets: AvatarSocket[];
  vectorId: string | null;
  vectorSeq: number | null;
  vectorStatus: VectorStatus | null;
  vectorFps: number | null;
  clipUrl: string | null;
  clipFormat: VectorFormat | null;
};

export const EMPTY_SCENE: SceneSource = {
  avatarId: null,
  avatarName: null,
  rig: null,
  modelUrl: null,
  heightM: null,
  sockets: [],
  vectorId: null,
  vectorSeq: null,
  vectorStatus: null,
  vectorFps: null,
  clipUrl: null,
  clipFormat: null,
};

function sameScene(a: SceneSource, b: SceneSource): boolean {
  return (
    a.avatarId === b.avatarId &&
    a.avatarName === b.avatarName &&
    a.rig === b.rig &&
    a.modelUrl === b.modelUrl &&
    a.heightM === b.heightM &&
    a.vectorId === b.vectorId &&
    a.vectorSeq === b.vectorSeq &&
    a.vectorStatus === b.vectorStatus &&
    a.vectorFps === b.vectorFps &&
    a.clipUrl === b.clipUrl &&
    a.clipFormat === b.clipFormat &&
    (a.sockets === b.sockets || JSON.stringify(a.sockets) === JSON.stringify(b.sockets))
  );
}

function sameItems(a: EquipmentItem[], b: EquipmentItem[]): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Workspace state shared by the three panes. Components subscribe to slices with selectors, so
 * typing in the inspector, scrolling the catalog or a queue refresh never re-renders the 3D
 * canvas: it listens to `scene`, `previewItems` and the view toggles only, and reads the
 * playback controls imperatively inside its frame loop.
 */
export type StudioState = {
  exerciseId: string | null;
  avatarId: string | null;
  vectorId: string | null;
  scene: SceneSource;
  /** Equipment items the inspector is editing, drawn live on the avatar. */
  previewItems: EquipmentItem[];
  playing: boolean;
  speed: number;
  showGrid: boolean;
  showEquipment: boolean;
  cameraPreset: CameraPreset;
  /** Bumped by "Reset view" so the camera rig re-applies the preset. */
  viewNonce: number;

  selectExercise: (exerciseId: string | null) => void;
  setAvatar: (avatarId: string | null) => void;
  setVector: (vectorId: string | null) => void;
  setScene: (scene: SceneSource) => void;
  setPreviewItems: (items: EquipmentItem[]) => void;
  togglePlaying: () => void;
  setSpeed: (speed: number) => void;
  toggleGrid: () => void;
  toggleEquipment: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  resetView: () => void;
};

export const useStudioStore = create<StudioState>((set) => ({
  exerciseId: null,
  avatarId: null,
  vectorId: null,
  scene: EMPTY_SCENE,
  previewItems: [],
  playing: true,
  speed: 1,
  showGrid: true,
  showEquipment: true,
  cameraPreset: "three-quarter",
  viewNonce: 0,

  selectExercise: (exerciseId) =>
    set((s) => (s.exerciseId === exerciseId ? s : { exerciseId, vectorId: null, previewItems: [] })),
  setAvatar: (avatarId) => set((s) => (s.avatarId === avatarId ? s : { avatarId })),
  setVector: (vectorId) => set((s) => (s.vectorId === vectorId ? s : { vectorId })),
  setScene: (scene) => set((s) => (sameScene(s.scene, scene) ? s : { scene })),
  setPreviewItems: (previewItems) =>
    set((s) => (sameItems(s.previewItems, previewItems) ? s : { previewItems })),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleEquipment: () => set((s) => ({ showEquipment: !s.showEquipment })),
  setCameraPreset: (cameraPreset) => set((s) => ({ cameraPreset, viewNonce: s.viewNonce + 1 })),
  resetView: () => set((s) => ({ viewNonce: s.viewNonce + 1 })),
}));
