"use client";

import { create } from "zustand";
import type { LoopMode, PoseAngles } from "./anatomy";
import type { ActiveEquipmentModels, AvatarSocket, EquipmentItem, EquipmentPlacement, VectorFormat, VectorStatus } from "./types";

export type CameraPreset = "front" | "three-quarter" | "side";

/**
 * The pose editor's draft: an ordered list of poses, how they loop and how long one loop takes.
 * While it is open the canvas plays the draft instead of the selected clip and, when paused,
 * holds the selected pose.
 */
export type PoseEditState = {
  /** The vector the draft started from (null for a clip started from scratch). */
  vectorId: string | null;
  sourceSeq: number | null;
  exerciseId: string;
  avatarId: string;
  items: EquipmentItem[];
  poses: PoseAngles[];
  mode: LoopMode;
  durationS: number;
  fps: number;
  twoHanded: boolean;
  grip: string | null;
  /** Index of the pose being edited. */
  keyframe: number;
  /** Edits of a left-side field apply to the right side too, and vice versa. */
  mirror: boolean;
  /** Handle being dragged in the viewport (left_hand, right_foot, hips, …), or null. */
  dragTarget: string | null;
  dirty: boolean;
  meta: Record<string, unknown>;
  /** Undo stack of the poses (newest last) and the redo stack (newest first). */
  history: PoseAngles[][];
  future: PoseAngles[][];
  /** When the last edit was recorded; edits within a short window share one undo step (a drag). */
  lastEditAt: number;
};

const HISTORY_LIMIT = 60;
const COALESCE_MS = 400;

/** The draft with its current poses pushed onto the undo stack (unless this edit continues the last one). */
function remember(draft: PoseEditState, coalesce = true): PoseEditState {
  const now = Date.now();
  if (coalesce && now - draft.lastEditAt < COALESCE_MS && draft.history.length) return { ...draft, lastEditAt: now, future: [] };
  const history = [...draft.history, draft.poses].slice(-HISTORY_LIMIT);
  return { ...draft, history, future: [], lastEditAt: now };
}

/** Rig editor: move the avatar's sockets, or a generated model relative to its socket, with a gizmo. */
export type EditMode = "off" | "sockets" | "model";
export type EditTool = "translate" | "rotate";
export type EditState = {
  mode: EditMode;
  /** Socket id (sockets mode) or equipment key `kind:code` (model mode). */
  target: string | null;
  tool: EditTool;
  /** Gizmo snapping: 45° steps and 5 mm steps, so a grip lands on 45 / 90 / 135 / 180. */
  snap: boolean;
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
  /** Clean motion-capture clips on load: ground and lock the feet, remove drift, close the loop. */
  cleanMocap: boolean;
  cameraPreset: CameraPreset;
  /** Bumped by "Reset view" so the camera rig re-applies the preset. */
  viewNonce: number;
  edit: EditState;
  poseEdit: PoseEditState | null;
  /** World position of the pinnable points of the pose the editor holds (from the canvas). */
  poseProbe: Record<string, [number, number, number]>;
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
  toggleCleanMocap: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  resetView: () => void;
  setEdit: (edit: Partial<EditState>) => void;
  startPoseEdit: (
    state: Omit<PoseEditState, "keyframe" | "dirty" | "dragTarget" | "history" | "future" | "lastEditAt"> &
      Partial<Pick<PoseEditState, "keyframe" | "dirty" | "dragTarget">>,
  ) => void;
  undoPose: () => void;
  redoPose: () => void;
  /** Copy a limb's angles onto the other side (same anatomical posture, mirrored). */
  copyLimbToOtherSide: (index: number, limb: "arm" | "leg", from: "left" | "right") => void;
  setPoseDragTarget: (target: string | null) => void;
  stopPoseEdit: () => void;
  setPoseKeyframe: (index: number) => void;
  updatePose: (index: number, pose: PoseAngles) => void;
  setPoseEditOptions: (options: Partial<Pick<PoseEditState, "mode" | "durationS" | "mirror" | "twoHanded">>) => void;
  /** Insert a copy of pose `index` right after it and select the copy. */
  duplicatePose: (index: number) => void;
  removePose: (index: number) => void;
  movePose: (index: number, direction: -1 | 1) => void;
  setPoseProbe: (probe: Record<string, [number, number, number]>) => void;
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
  cleanMocap: true,
  cameraPreset: "three-quarter",
  viewNonce: 0,
  edit: { mode: "off", target: null, tool: "translate", snap: true },
  poseEdit: null,
  poseProbe: {},
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
  toggleCleanMocap: () => set((s) => ({ cleanMocap: !s.cleanMocap })),
  setCameraPreset: (cameraPreset) => set((s) => ({ cameraPreset, viewNonce: s.viewNonce + 1 })),
  resetView: () => set((s) => ({ viewNonce: s.viewNonce + 1 })),
  setEdit: (edit) => set((s) => ({ edit: { ...s.edit, ...edit } })),
  startPoseEdit: (state) =>
    set({ poseEdit: { keyframe: 0, dirty: false, dragTarget: null, history: [], future: [], lastEditAt: 0, ...state }, playing: false }),
  undoPose: () =>
    set((s) => {
      const d = s.poseEdit;
      if (!d || !d.history.length) return s;
      const poses = d.history[d.history.length - 1];
      return {
        poseEdit: {
          ...d,
          poses,
          history: d.history.slice(0, -1),
          future: [d.poses, ...d.future].slice(0, HISTORY_LIMIT),
          keyframe: Math.min(d.keyframe, poses.length - 1),
          dirty: true,
          lastEditAt: 0,
        },
      };
    }),
  redoPose: () =>
    set((s) => {
      const d = s.poseEdit;
      if (!d || !d.future.length) return s;
      const [poses, ...future] = d.future;
      return {
        poseEdit: { ...d, poses, future, history: [...d.history, d.poses].slice(-HISTORY_LIMIT), keyframe: Math.min(d.keyframe, poses.length - 1), dirty: true, lastEditAt: 0 },
      };
    }),
  copyLimbToOtherSide: (index, limb, from) =>
    set((s) => {
      const d = s.poseEdit;
      if (!d) return s;
      const to = from === "left" ? "right" : "left";
      const poses = d.poses.map((p, i) => (i === index ? { ...p, [`${to}_${limb}`]: structuredClone(p[`${from}_${limb}`]) } : p));
      return { poseEdit: { ...remember(d, false), poses, dirty: true } };
    }),
  setPoseDragTarget: (dragTarget) => set((s) => (s.poseEdit && s.poseEdit.dragTarget !== dragTarget ? { poseEdit: { ...s.poseEdit, dragTarget } } : s)),
  stopPoseEdit: () => set({ poseEdit: null, playing: true }),
  setPoseKeyframe: (index) =>
    set((s) => (s.poseEdit ? { poseEdit: { ...s.poseEdit, keyframe: Math.max(0, Math.min(index, s.poseEdit.poses.length - 1)) }, playing: false } : s)),
  updatePose: (index, pose) =>
    set((s) => (s.poseEdit ? { poseEdit: { ...remember(s.poseEdit), poses: s.poseEdit.poses.map((p, i) => (i === index ? pose : p)), dirty: true } } : s)),
  setPoseEditOptions: (options) => set((s) => (s.poseEdit ? { poseEdit: { ...s.poseEdit, ...options, dirty: true } } : s)),
  duplicatePose: (index) =>
    set((s) => {
      if (!s.poseEdit || s.poseEdit.poses.length >= 8) return s;
      const poses = [...s.poseEdit.poses];
      poses.splice(index + 1, 0, structuredClone(poses[index]));
      return { poseEdit: { ...remember(s.poseEdit, false), poses, keyframe: index + 1, dirty: true } };
    }),
  removePose: (index) =>
    set((s) => {
      if (!s.poseEdit || s.poseEdit.poses.length <= 1) return s;
      const poses = s.poseEdit.poses.filter((_, i) => i !== index);
      return { poseEdit: { ...remember(s.poseEdit, false), poses, keyframe: Math.min(index, poses.length - 1), dirty: true } };
    }),
  movePose: (index, direction) =>
    set((s) => {
      if (!s.poseEdit) return s;
      const to = index + direction;
      if (to < 0 || to >= s.poseEdit.poses.length) return s;
      const poses = [...s.poseEdit.poses];
      [poses[index], poses[to]] = [poses[to], poses[index]];
      return { poseEdit: { ...remember(s.poseEdit, false), poses, keyframe: to, dirty: true } };
    }),
  setPoseProbe: (poseProbe) =>
    set((s) => (JSON.stringify(s.poseProbe) === JSON.stringify(poseProbe) ? s : { poseProbe })),
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
