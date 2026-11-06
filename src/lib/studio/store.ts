"use client";

import { create } from "zustand";
import type { ActiveEquipmentModels, AvatarSocket, EquipmentItem, EquipmentPlacement, VectorFormat, VectorStatus } from "./types";

export type CameraPreset = "front" | "three-quarter" | "side";

/** Rig editor: move the avatar's sockets, or a generated model relative to its socket, with a gizmo. */
export type EditMode = "off" | "sockets" | "model";
export type EditTool = "translate" | "rotate";
export type EditState = {
  mode: EditMode;
  /** Socket id (sockets mode) or equipment key `kind:code` (model mode). */
  target: string | null;
  tool: EditTool;
};

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

function sameModels(a: ActiveEquipmentModels, b: ActiveEquipmentModels): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Workspace state shared by the three panes. Components subscribe to slices with selectors, so
 * typing in the inspector, scrolling the catalog or a queue refresh never re-renders the 3D
 * canvas: it listens to `scene`, `previewItems`, `equipmentModels` and the view toggles only, and reads the
 * playback controls imperatively inside its frame loop.
 */
export type StudioState = {
  exerciseId: string | null;
  avatarId: string | null;
  vectorId: string | null;
  scene: SceneSource;
  /** Equipment items the inspector is editing, drawn live on the avatar. */
  previewItems: EquipmentItem[];
  /** The generated model per `kind:code` (active rows); items without one are drawn as proxies. */
  equipmentModels: ActiveEquipmentModels;
  playing: boolean;
  speed: number;
  showGrid: boolean;
  showEquipment: boolean;
  cameraPreset: CameraPreset;
  /** Bumped by "Reset view" so the camera rig re-applies the preset. */
  viewNonce: number;
  edit: EditState;
  /** Sockets being edited (the avatar's with the gizmo moves applied); null when untouched. */
  draftSockets: AvatarSocket[] | null;
  /** Placement being edited per equipment key; empty when untouched. */
  draftPlacements: Record<string, EquipmentPlacement>;

  selectExercise: (exerciseId: string | null) => void;
  setAvatar: (avatarId: string | null) => void;
  setVector: (vectorId: string | null) => void;
  setScene: (scene: SceneSource) => void;
  setPreviewItems: (items: EquipmentItem[]) => void;
  setEquipmentModels: (models: ActiveEquipmentModels) => void;
  togglePlaying: () => void;
  setSpeed: (speed: number) => void;
  toggleGrid: () => void;
  toggleEquipment: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  resetView: () => void;
  setEdit: (edit: Partial<EditState>) => void;
  setDraftSockets: (sockets: AvatarSocket[] | null) => void;
  updateDraftSocket: (base: AvatarSocket[], id: string, patch: Pick<AvatarSocket, "offset" | "rotation">) => void;
  setDraftPlacement: (key: string, placement: EquipmentPlacement | null) => void;
  clearDrafts: () => void;
};

export const useStudioStore = create<StudioState>((set) => ({
  exerciseId: null,
  avatarId: null,
  vectorId: null,
  scene: EMPTY_SCENE,
  previewItems: [],
  equipmentModels: {},
  playing: true,
  speed: 1,
  showGrid: true,
  showEquipment: true,
  cameraPreset: "three-quarter",
  viewNonce: 0,
  edit: { mode: "off", target: null, tool: "translate" },
  draftSockets: null,
  draftPlacements: {},

  selectExercise: (exerciseId) =>
    set((s) => (s.exerciseId === exerciseId ? s : { exerciseId, vectorId: null, previewItems: [] })),
  setAvatar: (avatarId) => set((s) => (s.avatarId === avatarId ? s : { avatarId })),
  setVector: (vectorId) => set((s) => (s.vectorId === vectorId ? s : { vectorId })),
  setScene: (scene) => set((s) => (sameScene(s.scene, scene) ? s : { scene })),
  setPreviewItems: (previewItems) =>
    set((s) => (sameItems(s.previewItems, previewItems) ? s : { previewItems })),
  setEquipmentModels: (equipmentModels) =>
    set((s) => (sameModels(s.equipmentModels, equipmentModels) ? s : { equipmentModels })),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleEquipment: () => set((s) => ({ showEquipment: !s.showEquipment })),
  setCameraPreset: (cameraPreset) => set((s) => ({ cameraPreset, viewNonce: s.viewNonce + 1 })),
  resetView: () => set((s) => ({ viewNonce: s.viewNonce + 1 })),
  setEdit: (edit) => set((s) => ({ edit: { ...s.edit, ...edit } })),
  setDraftSockets: (draftSockets) => set({ draftSockets }),
  updateDraftSocket: (base, id, patch) =>
    set((s) => ({
      draftSockets: (s.draftSockets ?? base).map((socket) => (socket.id === id ? { ...socket, ...patch } : socket)),
    })),
  setDraftPlacement: (key, placement) =>
    set((s) => {
      const next = { ...s.draftPlacements };
      if (placement) next[key] = placement;
      else delete next[key];
      return { draftPlacements: next };
    }),
  clearDrafts: () => set({ draftSockets: null, draftPlacements: {} }),
}));
