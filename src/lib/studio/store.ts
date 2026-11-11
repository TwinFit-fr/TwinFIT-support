"use client";

import { create } from "zustand";
import type { LoopMode, PoseAngles } from "./anatomy.ts";
import { savedFrom, type DraftOrigin } from "./pose-origin.ts";
import type { PoseIssue } from "./pose-validate";
import type { ActiveEquipmentModels, AvatarSocket, EquipmentItem, EquipmentPlacement, VectorFormat, VectorStatus } from "./types";

export type CameraPreset = "front" | "three-quarter" | "side";

/**
 * What one undo step restores: everything the clip is made of, not just the angles, plus where
 * it came from. The meta holds the draft's flags (template, one side working, airborne) that
 * the body checks read, so undoing a draft also undoes them.
 */
export type PoseSnapshot = {
  poses: PoseAngles[];
  weights: number[] | null;
  labels: string[] | null;
  mode: LoopMode;
  grip: string | null;
  durationS: number;
  twoHanded: boolean;
  meta: Record<string, unknown>;
  origin: DraftOrigin;
  /** The user changed something since the origin (a manual edit, not a draft or a save). */
  edited: boolean;
};

/**
 * The pose editor's draft: an ordered list of poses, how they loop and how long one loop takes.
 * While it is open the canvas plays the draft instead of the selected clip and, when paused,
 * holds the selected pose.
 */
export type PoseEditState = PoseSnapshot & {
  /** Identity of this opened draft (a new one per startPoseEdit): an AI request started on it lands only on it. */
  editId: number;
  /** The vector the draft started from (null for a clip started from scratch). */
  vectorId: string | null;
  sourceSeq: number | null;
  exerciseId: string;
  avatarId: string;
  items: EquipmentItem[];
  fps: number;
  /** Index of the pose being edited. */
  keyframe: number;
  /** Edits of a left-side field apply to the right side too, and vice versa. */
  mirror: boolean;
  /** Body point selected on the stage (left_hand, chest, hips, … see pose-points.ts), or null. */
  dragTarget: string | null;
  /** Unsaved work worth a question before it is dropped: a manual edit or a requested AI draft. */
  dirty: boolean;
  /** Undo stack (newest last) and redo stack (newest first). */
  history: PoseSnapshot[];
  future: PoseSnapshot[];
  /** A slider drag or a handle drag in progress: its edits share the undo step opened by its first one. */
  gestureOpen: boolean;
};

const HISTORY_LIMIT = 60;
let editCounter = 0;
export const MAX_POSES = 8;

function snapshotOf(d: PoseEditState): PoseSnapshot {
  return {
    poses: d.poses,
    weights: d.weights,
    labels: d.labels,
    mode: d.mode,
    grip: d.grip,
    durationS: d.durationS,
    twoHanded: d.twoHanded,
    meta: d.meta,
    origin: d.origin,
    edited: d.edited,
  };
}

/**
 * The draft with its current state pushed onto the undo stack. An edit inside an open gesture
 * (a drag that already pushed) does not push again; `gesture` says whether this edit opens or
 * continues one. Any edit clears the redo stack and marks the poses as edited by the user.
 */
function remember(draft: PoseEditState, gesture = false): PoseEditState {
  if (gesture && draft.gestureOpen) return { ...draft, future: [], edited: true };
  const history = [...draft.history, snapshotOf(draft)].slice(-HISTORY_LIMIT);
  return { ...draft, history, future: [], gestureOpen: gesture, edited: true };
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

/** Sockets being edited, bound to the avatar they were taken from: a draft never lands on another avatar. */
export type SocketDraft = { avatarId: string; sockets: AvatarSocket[] };

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

function sameJson(a: unknown, b: unknown): boolean {
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
  /**
   * Paused on a moment that is not a key pose (the timeline was scrubbed there, or a clip was
   * paused mid-loop): the stage shows the clip at this time, in seconds. Null while playing and
   * while the editor holds a key pose.
   */
  scrubTime: number | null;
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
  /** Bone names of the loaded avatar (from the canvas), for the rig editor's socket picker. */
  modelBones: string[];
  /** What the validator says about the clip on screen, on the avatar's own rig. */
  poseIssues: PoseIssue[];
  /** The poses changed and the body checks have not run on them yet (poseIssues is the previous result). */
  poseChecksPending: boolean;
  /** Sockets being edited (the avatar's with the gizmo moves applied); null when untouched. */
  draftSockets: SocketDraft | null;
  /** Placement being edited per equipment key; empty when untouched. */
  draftPlacements: Record<string, EquipmentPlacement>;

  selectExercise: (exerciseId: string | null) => void;
  setAvatar: (avatarId: string | null) => void;
  setVector: (vectorId: string | null) => void;
  setScene: (scene: SceneSource) => void;
  setPreviewItems: (items: EquipmentItem[]) => void;
  setEquipmentModels: (models: ActiveEquipmentModels) => void;
  togglePlaying: () => void;
  /** Playing on, or stopped holding the selected pose (playback.ts pauses where it is). */
  setPlaying: (playing: boolean) => void;
  /** One step of the playhead: playing or not, the in-between time shown (or null), the pose held. */
  setStageTime: (next: { playing: boolean; scrubTime: number | null; keyframe?: number }) => void;
  setSpeed: (speed: number) => void;
  toggleGrid: () => void;
  toggleEquipment: () => void;
  toggleCleanMocap: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  resetView: () => void;
  setEdit: (edit: Partial<EditState>) => void;
  setModelBones: (bones: string[]) => void;
  /** The result of the body checks on the poses as they are now (clears poseChecksPending). */
  setPoseIssues: (issues: PoseIssue[]) => void;
  /** The poses changed: the body checks will run again once the edits settle. */
  markPoseChecksPending: () => void;
  startPoseEdit: (
    state: Omit<PoseEditState, "editId" | "keyframe" | "dirty" | "dragTarget" | "history" | "future" | "gestureOpen" | "weights" | "labels" | "edited"> &
      Partial<Pick<PoseEditState, "keyframe" | "dirty" | "dragTarget" | "weights" | "labels" | "edited">>,
  ) => void;
  /** Replace every pose (an AI draft): one undo step, which also brings back the previous origin and meta. */
  replacePoses: (next: {
    poses: PoseAngles[];
    origin: DraftOrigin;
    mode?: LoopMode;
    weights?: number[] | null;
    labels?: string[] | null;
    grip?: string | null;
    twoHanded?: boolean;
    meta?: Record<string, unknown>;
    /** The pose to hold afterwards (default the first): a rebuild from a drag stays on the dragged pose. */
    keyframe?: number;
    /** The new poses still hold something set by hand (carried across a rebuild): default false. */
    edited?: boolean;
  }) => void;
  /** The poses were stored as `vector`: it becomes the clip being edited, nothing left unsaved. */
  markPoseSaved: (vector: { id: string; seq: number }) => void;
  undoPose: () => void;
  redoPose: () => void;
  /** Copy a limb's angles onto the other side (same anatomical posture, mirrored). */
  copyLimbToOtherSide: (index: number, limb: "arm" | "leg", from: "left" | "right") => void;
  setPoseDragTarget: (target: string | null) => void;
  stopPoseEdit: () => void;
  setPoseKeyframe: (index: number) => void;
  /** `gesture` = part of a drag: the first edit of the drag opens the undo step, the rest share it until endPoseGesture. */
  updatePose: (index: number, pose: PoseAngles, gesture?: boolean) => void;
  endPoseGesture: () => void;
  setPoseEditOptions: (options: Partial<Pick<PoseEditState, "mode" | "durationS" | "mirror" | "twoHanded">>) => void;
  setPoseLabel: (index: number, label: string) => void;
  /** Relative time spent getting into pose `index` (see buildKeyframes); null resets to even spacing. */
  setPoseWeight: (index: number, weight: number | null) => void;
  /** Insert a copy of pose `index` right after it and select the copy. */
  duplicatePose: (index: number) => void;
  removePose: (index: number) => void;
  movePose: (index: number, direction: -1 | 1) => void;
  setPoseProbe: (probe: Record<string, [number, number, number]>) => void;
  setDraftSockets: (draft: SocketDraft | null) => void;
  /** Change one socket of the draft (started from `base`, the avatar's saved sockets). */
  updateDraftSocket: (avatarId: string, base: AvatarSocket[], id: string, patch: Partial<Omit<AvatarSocket, "id">>) => void;
  addDraftSocket: (avatarId: string, base: AvatarSocket[], socket: AvatarSocket) => void;
  removeDraftSocket: (avatarId: string, base: AvatarSocket[], id: string) => void;
  setDraftPlacement: (key: string, placement: EquipmentPlacement | null) => void;
  clearDrafts: () => void;
};

const NO_EDIT: EditState = { mode: "off", target: null, tool: "translate", snap: true };

export const useStudioStore = create<StudioState>((set) => ({
  exerciseId: null,
  avatarId: null,
  vectorId: null,
  scene: EMPTY_SCENE,
  previewItems: [],
  equipmentModels: {},
  playing: true,
  scrubTime: null,
  speed: 1,
  showGrid: true,
  showEquipment: true,
  cleanMocap: true,
  cameraPreset: "three-quarter",
  viewNonce: 0,
  edit: NO_EDIT,
  poseEdit: null,
  poseProbe: {},
  modelBones: [],
  poseIssues: [],
  poseChecksPending: false,
  draftSockets: null,
  draftPlacements: {},

  selectExercise: (exerciseId) =>
    set((s) => (s.exerciseId === exerciseId ? s : { exerciseId, vectorId: null, previewItems: [], scrubTime: null })),
  // Another avatar: rig drafts belong to the previous one, so they go, and the gizmo closes.
  setAvatar: (avatarId) =>
    set((s) => (s.avatarId === avatarId ? s : { avatarId, draftSockets: null, draftPlacements: {}, edit: NO_EDIT, modelBones: [] })),
  setVector: (vectorId) => set((s) => (s.vectorId === vectorId ? s : { vectorId, scrubTime: null })),
  setScene: (scene) => set((s) => (sameScene(s.scene, scene) ? s : { scene })),
  setPreviewItems: (previewItems) => set((s) => (sameJson(s.previewItems, previewItems) ? s : { previewItems })),
  setEquipmentModels: (equipmentModels) => set((s) => (sameJson(s.equipmentModels, equipmentModels) ? s : { equipmentModels })),
  togglePlaying: () => set((s) => ({ playing: !s.playing, scrubTime: null })),
  setPlaying: (playing) => set((s) => (s.playing === playing && s.scrubTime === null ? s : { playing, scrubTime: null })),
  setStageTime: ({ playing, scrubTime, keyframe }) =>
    set((s) => {
      const edit = s.poseEdit;
      const hold = keyframe !== undefined && edit ? Math.max(0, Math.min(keyframe, edit.poses.length - 1)) : null;
      const poseEdit = edit && hold !== null && hold !== edit.keyframe ? { ...edit, keyframe: hold, gestureOpen: false } : edit;
      if (s.playing === playing && s.scrubTime === scrubTime && poseEdit === edit) return s;
      return { playing, scrubTime, poseEdit };
    }),
  setSpeed: (speed) => set({ speed }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleEquipment: () => set((s) => ({ showEquipment: !s.showEquipment })),
  toggleCleanMocap: () => set((s) => ({ cleanMocap: !s.cleanMocap })),
  setCameraPreset: (cameraPreset) => set((s) => ({ cameraPreset, viewNonce: s.viewNonce + 1 })),
  resetView: () => set((s) => ({ viewNonce: s.viewNonce + 1 })),
  setEdit: (edit) => set((s) => ({ edit: { ...s.edit, ...edit } })),
  setModelBones: (modelBones) => set((s) => (sameJson(s.modelBones, modelBones) ? s : { modelBones })),
  setPoseIssues: (poseIssues) => set((s) => (sameJson(s.poseIssues, poseIssues) ? (s.poseChecksPending ? { poseChecksPending: false } : s) : { poseIssues, poseChecksPending: false })),
  markPoseChecksPending: () => set((s) => (s.poseChecksPending ? s : { poseChecksPending: true })),
  startPoseEdit: (state) =>
    set({
      poseEdit: { keyframe: 0, dirty: false, dragTarget: null, history: [], future: [], gestureOpen: false, weights: null, labels: null, edited: false, ...state, editId: ++editCounter },
      playing: false,
      scrubTime: null,
    }),
  replacePoses: (next) =>
    set((s) => {
      if (!s.poseEdit) return s;
      return {
        poseEdit: {
          ...remember(s.poseEdit),
          poses: next.poses,
          mode: next.mode ?? s.poseEdit.mode,
          weights: next.weights === undefined ? s.poseEdit.weights : next.weights,
          labels: next.labels === undefined ? s.poseEdit.labels : next.labels,
          grip: next.grip === undefined ? s.poseEdit.grip : next.grip,
          twoHanded: next.twoHanded ?? s.poseEdit.twoHanded,
          meta: { ...s.poseEdit.meta, ...next.meta },
          origin: next.origin,
          edited: next.edited ?? false,
          keyframe: Math.max(0, Math.min(next.keyframe ?? 0, next.poses.length - 1)),
          dirty: true,
        },
        scrubTime: null,
      };
    }),
  markPoseSaved: (vector) =>
    set((s) =>
      s.poseEdit
        ? {
            poseEdit: {
              ...s.poseEdit,
              vectorId: vector.id,
              sourceSeq: vector.seq,
              origin: { kind: "clip", vectorId: vector.id, seq: vector.seq, from: savedFrom(s.poseEdit.origin, s.poseEdit.edited) },
              edited: false,
              dirty: false,
              gestureOpen: false,
            },
            vectorId: vector.id,
          }
        : s,
    ),
  undoPose: () =>
    set((s) => {
      const d = s.poseEdit;
      if (!d || !d.history.length) return s;
      const snapshot = d.history[d.history.length - 1];
      return {
        poseEdit: {
          ...d,
          ...snapshot,
          history: d.history.slice(0, -1),
          future: [snapshotOf(d), ...d.future].slice(0, HISTORY_LIMIT),
          keyframe: Math.min(d.keyframe, snapshot.poses.length - 1),
          dirty: true,
          gestureOpen: false,
        },
      };
    }),
  redoPose: () =>
    set((s) => {
      const d = s.poseEdit;
      if (!d || !d.future.length) return s;
      const [snapshot, ...future] = d.future;
      return {
        poseEdit: {
          ...d,
          ...snapshot,
          future,
          history: [...d.history, snapshotOf(d)].slice(-HISTORY_LIMIT),
          keyframe: Math.min(d.keyframe, snapshot.poses.length - 1),
          dirty: true,
          gestureOpen: false,
        },
      };
    }),
  copyLimbToOtherSide: (index, limb, from) =>
    set((s) => {
      const d = s.poseEdit;
      if (!d) return s;
      const to = from === "left" ? "right" : "left";
      const poses = d.poses.map((p, i) => (i === index ? { ...p, [`${to}_${limb}`]: structuredClone(p[`${from}_${limb}`]) } : p));
      return { poseEdit: { ...remember(d), poses, dirty: true }, scrubTime: null };
    }),
  setPoseDragTarget: (dragTarget) =>
    set((s) => (s.poseEdit && s.poseEdit.dragTarget !== dragTarget ? { poseEdit: { ...s.poseEdit, dragTarget, gestureOpen: false } } : s)),
  stopPoseEdit: () => set({ poseEdit: null, poseProbe: {}, playing: true, scrubTime: null }),
  setPoseKeyframe: (index) =>
    set((s) =>
      s.poseEdit
        ? { poseEdit: { ...s.poseEdit, keyframe: Math.max(0, Math.min(index, s.poseEdit.poses.length - 1)), gestureOpen: false }, playing: false, scrubTime: null }
        : s,
    ),
  // An edit pauses playback and holds the pose being edited, so the change is seen where it was made.
  updatePose: (index, pose, gesture = false) =>
    set((s) =>
      s.poseEdit
        ? { poseEdit: { ...remember(s.poseEdit, gesture), poses: s.poseEdit.poses.map((p, i) => (i === index ? pose : p)), dirty: true }, playing: false, scrubTime: null }
        : s,
    ),
  endPoseGesture: () => set((s) => (s.poseEdit?.gestureOpen ? { poseEdit: { ...s.poseEdit, gestureOpen: false } } : s)),
  setPoseEditOptions: (options) =>
    set((s) => {
      if (!s.poseEdit) return s;
      // The clip-shaping options are undoable; the mirror toggle is a tool setting.
      const undoable = "mode" in options || "durationS" in options || "twoHanded" in options;
      // An in-between being looked at stays, inside the new length.
      const scrubTime = s.scrubTime !== null && options.durationS !== undefined ? Math.min(s.scrubTime, options.durationS) : s.scrubTime;
      return { poseEdit: { ...(undoable ? remember(s.poseEdit) : s.poseEdit), ...options, dirty: true }, scrubTime };
    }),
  setPoseLabel: (index, label) =>
    set((s) => {
      if (!s.poseEdit) return s;
      const labels = s.poseEdit.poses.map((_, i) => s.poseEdit!.labels?.[i] ?? "");
      labels[index] = label;
      return { poseEdit: { ...remember(s.poseEdit, true), labels: labels.every((l) => !l) ? null : labels, dirty: true } };
    }),
  setPoseWeight: (index, weight) =>
    set((s) => {
      if (!s.poseEdit) return s;
      const weights = s.poseEdit.poses.map((_, i) => s.poseEdit!.weights?.[i] ?? 1);
      weights[index] = weight === null ? 1 : Math.max(0.05, weight);
      return { poseEdit: { ...remember(s.poseEdit, true), weights: weights.every((w) => w === 1) ? null : weights, dirty: true } };
    }),
  duplicatePose: (index) =>
    set((s) => {
      if (!s.poseEdit || s.poseEdit.poses.length >= MAX_POSES) return s;
      const poses = [...s.poseEdit.poses];
      poses.splice(index + 1, 0, structuredClone(poses[index]));
      const weights = s.poseEdit.weights ? [...s.poseEdit.weights] : null;
      weights?.splice(index + 1, 0, weights[index]);
      const labels = s.poseEdit.labels ? [...s.poseEdit.labels] : null;
      labels?.splice(index + 1, 0, labels[index] ? `${labels[index]} copy` : "");
      return { poseEdit: { ...remember(s.poseEdit), poses, weights, labels, keyframe: index + 1, dirty: true }, scrubTime: null };
    }),
  removePose: (index) =>
    set((s) => {
      if (!s.poseEdit || s.poseEdit.poses.length <= 1) return s;
      const poses = s.poseEdit.poses.filter((_, i) => i !== index);
      const weights = s.poseEdit.weights?.filter((_, i) => i !== index) ?? null;
      const labels = s.poseEdit.labels?.filter((_, i) => i !== index) ?? null;
      return { poseEdit: { ...remember(s.poseEdit), poses, weights, labels, keyframe: Math.min(index, poses.length - 1), dirty: true }, scrubTime: null };
    }),
  movePose: (index, direction) =>
    set((s) => {
      if (!s.poseEdit) return s;
      const to = index + direction;
      if (to < 0 || to >= s.poseEdit.poses.length) return s;
      const poses = [...s.poseEdit.poses];
      [poses[index], poses[to]] = [poses[to], poses[index]];
      const weights = s.poseEdit.weights ? [...s.poseEdit.weights] : null;
      if (weights) [weights[index], weights[to]] = [weights[to], weights[index]];
      const labels = s.poseEdit.labels ? [...s.poseEdit.labels] : null;
      if (labels) [labels[index], labels[to]] = [labels[to], labels[index]];
      return { poseEdit: { ...remember(s.poseEdit), poses, weights, labels, keyframe: to, dirty: true }, scrubTime: null };
    }),
  setPoseProbe: (poseProbe) => set((s) => (sameJson(s.poseProbe, poseProbe) ? s : { poseProbe })),
  setDraftSockets: (draftSockets) => set({ draftSockets }),
  updateDraftSocket: (avatarId, base, id, patch) =>
    set((s) => {
      const current = s.draftSockets?.avatarId === avatarId ? s.draftSockets.sockets : base;
      return { draftSockets: { avatarId, sockets: current.map((socket) => (socket.id === id ? { ...socket, ...patch } : socket)) } };
    }),
  addDraftSocket: (avatarId, base, socket) =>
    set((s) => {
      const current = s.draftSockets?.avatarId === avatarId ? s.draftSockets.sockets : base;
      if (current.some((x) => x.id === socket.id)) return s;
      return { draftSockets: { avatarId, sockets: [...current, socket] }, edit: { ...s.edit, mode: "sockets", target: socket.id } };
    }),
  removeDraftSocket: (avatarId, base, id) =>
    set((s) => {
      const current = s.draftSockets?.avatarId === avatarId ? s.draftSockets.sockets : base;
      const sockets = current.filter((x) => x.id !== id);
      return { draftSockets: { avatarId, sockets }, edit: s.edit.target === id ? { ...s.edit, target: sockets[0]?.id ?? null } : s.edit };
    }),
  setDraftPlacement: (key, placement) =>
    set((s) => {
      const next = { ...s.draftPlacements };
      if (placement) next[key] = placement;
      else delete next[key];
      return { draftPlacements: next };
    }),
  clearDrafts: () => set({ draftSockets: null, draftPlacements: {} }),
}));
