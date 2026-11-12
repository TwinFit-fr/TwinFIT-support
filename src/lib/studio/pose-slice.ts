// The pose editor's part of the studio store: the open draft, its undo history and every pose
// action, plus the pose probe the canvas reports.
import type { LoopMode, PoseAngles } from "./anatomy.ts";
import { savedFrom, type DraftOrigin } from "./pose-origin.ts";
import type { EditState } from "./rig-slice.ts";
import { sameJson } from "./same-json.ts";
import type { EquipmentItem } from "./types";

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

/**
 * The pose editor's part of the studio store: the draft being posed with its undo history, and
 * where the canvas says the pinnable points of the held pose are. Its actions also pause or
 * resume playback, clear the in-between time, select the saved clip and close the rig editor.
 */
export type PoseSlice = {
  poseEdit: PoseEditState | null;
  /** World position of the pinnable points of the pose the editor holds (from the canvas). */
  poseProbe: Record<string, [number, number, number]>;

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
};

/** What the pose actions read and write: this slice, plus the playback, selected clip and rig editor fields they touch. */
type PoseView = PoseSlice & { playing: boolean; scrubTime: number | null; vectorId: string | null; edit: EditState };
type PoseSet = (partial: Partial<PoseView> | ((s: PoseView) => Partial<PoseView>)) => void;

export function createPoseSlice(set: PoseSet): PoseSlice {
  return {
    poseEdit: null,
    poseProbe: {},

    // Posing and rig editing never run at once: callers close the rig editor through the unsaved-work
    // guard first (use-selection-guard.ts); this only makes sure no path leaves both open.
    startPoseEdit: (state) =>
      set((s) => ({
        poseEdit: { keyframe: 0, dirty: false, dragTarget: null, history: [], future: [], gestureOpen: false, weights: null, labels: null, edited: false, ...state, editId: ++editCounter },
        playing: false,
        scrubTime: null,
        edit: s.edit.mode === "off" ? s.edit : { ...s.edit, mode: "off" },
      })),
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
  };
}
