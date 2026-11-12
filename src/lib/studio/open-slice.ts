// What the studio has open: the selected exercise, avatar and clip, the scene the canvas draws,
// the equipment previewed and modelled, and the loaded avatar's bones.
import type { PlaybackSlice } from "./playback-slice.ts";
import { EMPTY_RIG_HISTORY } from "./rig-history.ts";
import { NO_EDIT, type RigSlice } from "./rig-slice.ts";
import { sameJson } from "./same-json.ts";
import type { ActiveEquipmentModels, AvatarSocket, EquipmentItem, VectorFormat, VectorStatus } from "./types";

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

/**
 * The selection part of the studio store: which exercise, avatar and clip are open, the scene
 * derived from them, the equipment drawn on the avatar and the avatar's bone names. Choosing
 * another exercise or clip also clears the in-between time; another avatar drops the rig drafts.
 */
export type OpenSlice = {
  exerciseId: string | null;
  avatarId: string | null;
  vectorId: string | null;
  scene: SceneSource;
  /** Equipment items the inspector is editing, drawn live on the avatar. */
  previewItems: EquipmentItem[];
  /** The generated model per `kind:code` (active rows); items without one are drawn as proxies. */
  equipmentModels: ActiveEquipmentModels;
  /** Bone names of the loaded avatar (from the canvas), for the rig editor's socket picker. */
  modelBones: string[];

  selectExercise: (exerciseId: string | null) => void;
  setAvatar: (avatarId: string | null) => void;
  setVector: (vectorId: string | null) => void;
  setScene: (scene: SceneSource) => void;
  setPreviewItems: (items: EquipmentItem[]) => void;
  setEquipmentModels: (models: ActiveEquipmentModels) => void;
  setModelBones: (bones: string[]) => void;
};

/** What the selection actions read and write: this slice, plus the in-between time and the rig drafts they reset. */
type OpenView = OpenSlice & Pick<PlaybackSlice, "scrubTime"> & Pick<RigSlice, "draftSockets" | "draftPlacements" | "rigHistory" | "edit">;
type OpenSet = (fn: (s: OpenView) => Partial<OpenView>) => void;

export function createOpenSlice(set: OpenSet): OpenSlice {
  return {
    exerciseId: null,
    avatarId: null,
    vectorId: null,
    scene: EMPTY_SCENE,
    previewItems: [],
    equipmentModels: {},
    modelBones: [],

    selectExercise: (exerciseId) =>
      set((s) => (s.exerciseId === exerciseId ? s : { exerciseId, vectorId: null, previewItems: [], scrubTime: null })),
    // Another avatar: rig drafts belong to the previous one, so they go, and the gizmo closes.
    setAvatar: (avatarId) =>
      set((s) => (s.avatarId === avatarId ? s : { avatarId, draftSockets: null, draftPlacements: {}, rigHistory: EMPTY_RIG_HISTORY, edit: NO_EDIT, modelBones: [] })),
    setVector: (vectorId) => set((s) => (s.vectorId === vectorId ? s : { vectorId, scrubTime: null })),
    setScene: (scene) => set((s) => (sameScene(s.scene, scene) ? s : { scene })),
    setPreviewItems: (previewItems) => set((s) => (sameJson(s.previewItems, previewItems) ? s : { previewItems })),
    setEquipmentModels: (equipmentModels) => set((s) => (sameJson(s.equipmentModels, equipmentModels) ? s : { equipmentModels })),
    setModelBones: (modelBones) => set((s) => (sameJson(s.modelBones, modelBones) ? s : { modelBones })),
  };
}
