import { EMPTY_RIG_HISTORY, endRigGesture, recordRig, redoRig, undoRig, type RigHistory, type RigSnapshot, type SocketDraft } from "./rig-history.ts";
import { equipmentLabel, socketLabel } from "./rig-points.ts";
import type { AvatarSocket, EquipmentPlacement } from "./types";

export type { SocketDraft } from "./rig-history.ts";

/** Rig editor: move the avatar's sockets, or a generated model relative to its socket. */
export type EditMode = "off" | "sockets" | "model";
export type EditTool = "translate" | "rotate";
export type EditState = {
  mode: EditMode;
  /** Socket id (sockets mode) or equipment key `kind:code` (model mode). */
  target: string | null;
  tool: EditTool;
  /** Snapping of the gizmo and of a point dragged on the body (steps in rig-points.ts). Off until asked for. */
  snap: boolean;
};

export const NO_EDIT: EditState = { mode: "off", target: null, tool: "translate", snap: false };

/** How an edit joins the undo history: part of a drag (`gesture`), and what to call it when it is undone. */
export type RigEditOptions = { gesture?: boolean; label?: string };

/**
 * The rig editor's part of the studio store: what is being edited, the unsaved drafts (sockets
 * bound to their avatar, placements by equipment key) and their undo history (rig-history.ts).
 */
export type RigSlice = {
  edit: EditState;
  /** Sockets being edited (the avatar's with the edits applied); null when untouched. */
  draftSockets: SocketDraft | null;
  /** Placement being edited per equipment key; empty when untouched. */
  draftPlacements: Record<string, EquipmentPlacement>;
  rigHistory: RigHistory;
  setEdit: (edit: Partial<EditState>) => void;
  setDraftSockets: (draft: SocketDraft | null) => void;
  /** Change one socket of the draft (started from `base`, the avatar's saved sockets). */
  updateDraftSocket: (avatarId: string, base: AvatarSocket[], id: string, patch: Partial<Omit<AvatarSocket, "id">>, options?: RigEditOptions) => void;
  addDraftSocket: (avatarId: string, base: AvatarSocket[], socket: AvatarSocket) => void;
  removeDraftSocket: (avatarId: string, base: AvatarSocket[], id: string) => void;
  setDraftPlacement: (key: string, placement: EquipmentPlacement | null, options?: RigEditOptions) => void;
  /** Drop every unsaved rig change, and the history that led to it. */
  clearDrafts: () => void;
  /** Step back or forward; returns what was undone or redone ("Moved Left hand"), or null when there was nothing. */
  undoRig: () => string | null;
  redoRig: () => string | null;
  /** A drag on a point, the gizmo or a held arrow key is over: the next edit is a new undo step. */
  endRigGesture: () => void;
};

type RigSet = (fn: (s: RigSlice) => Partial<RigSlice>) => void;

const snapshotOf = (s: RigSlice): RigSnapshot => ({ sockets: s.draftSockets, placements: s.draftPlacements, target: s.edit.target });

/** The drafts after an edit, with the state before it remembered (folded into an open drag when `gesture`). */
function remember(s: RigSlice, label: string, gesture = false): Pick<RigSlice, "rigHistory"> {
  return { rigHistory: recordRig(s.rigHistory, snapshotOf(s), label, gesture) };
}

const currentSockets = (s: RigSlice, avatarId: string, base: AvatarSocket[]) => (s.draftSockets?.avatarId === avatarId ? s.draftSockets.sockets : base);

function editLabel(id: string, patch: Partial<Omit<AvatarSocket, "id">>): string {
  const name = socketLabel(id);
  if ("bone" in patch && patch.bone) return `Reset ${name}`;
  return "offset" in patch ? `Moved ${name}` : `Rotated ${name}`;
}

export function createRigSlice(set: RigSet): RigSlice {
  const step = (pick: typeof undoRig) => {
    let label: string | null = null;
    set((s) => {
      const result = pick(s.rigHistory, snapshotOf(s));
      if (!result) return s;
      label = result.label;
      const { sockets, placements, target } = result.snapshot;
      return { draftSockets: sockets, draftPlacements: placements, rigHistory: result.history, edit: { ...s.edit, target } };
    });
    return label;
  };
  return {
    edit: NO_EDIT,
    draftSockets: null,
    draftPlacements: {},
    rigHistory: EMPTY_RIG_HISTORY,
    setEdit: (edit) => set((s) => ({ edit: { ...s.edit, ...edit } })),
    setDraftSockets: (draftSockets) => set(() => ({ draftSockets })),
    updateDraftSocket: (avatarId, base, id, patch, options = {}) =>
      set((s) => {
        const current = currentSockets(s, avatarId, base);
        return {
          ...remember(s, options.label ?? editLabel(id, patch), options.gesture),
          draftSockets: { avatarId, sockets: current.map((socket) => (socket.id === id ? { ...socket, ...patch } : socket)) },
        };
      }),
    addDraftSocket: (avatarId, base, socket) =>
      set((s) => {
        const current = currentSockets(s, avatarId, base);
        if (current.some((x) => x.id === socket.id)) return s;
        return { ...remember(s, `Added ${socketLabel(socket.id)}`), draftSockets: { avatarId, sockets: [...current, socket] }, edit: { ...s.edit, mode: "sockets", target: socket.id } };
      }),
    removeDraftSocket: (avatarId, base, id) =>
      set((s) => {
        const current = currentSockets(s, avatarId, base);
        const sockets = current.filter((x) => x.id !== id);
        return {
          ...remember(s, `Removed ${socketLabel(id)}`),
          draftSockets: { avatarId, sockets },
          edit: s.edit.target === id ? { ...s.edit, target: sockets[0]?.id ?? null } : s.edit,
        };
      }),
    setDraftPlacement: (key, placement, options = {}) =>
      set((s) => {
        const next = { ...s.draftPlacements };
        if (placement) next[key] = placement;
        else delete next[key];
        return { ...remember(s, options.label ?? `Moved ${equipmentLabel(key)}`, options.gesture), draftPlacements: next };
      }),
    clearDrafts: () => set(() => ({ draftSockets: null, draftPlacements: {}, rigHistory: EMPTY_RIG_HISTORY })),
    undoRig: () => step(undoRig),
    redoRig: () => step(redoRig),
    endRigGesture: () => set((s) => (s.rigHistory.gestureOpen ? { rigHistory: endRigGesture(s.rigHistory) } : s)),
  };
}
