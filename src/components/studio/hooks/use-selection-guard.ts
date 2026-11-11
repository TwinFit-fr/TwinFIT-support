"use client";

import { useCallback } from "react";
import { useConfirm } from "@/components/ui/confirm";
import { useStudioStore } from "@/lib/studio/store";

/**
 * Changing exercise, avatar or the clip in the editor while the pose editor or the rig editor
 * holds unsaved work asks first; on yes the drafts are dropped and the change goes through. An
 * untouched automatic draft is not unsaved work: it goes without a question. Returns false when
 * the user kept their work. Opening another clip concerns the poses only, not the rig.
 */
export function useSelectionGuard() {
  const confirm = useConfirm();
  return useCallback(
    async (what: "exercise" | "avatar" | "clip"): Promise<boolean> => {
      const s = useStudioStore.getState();
      const poseDirty = Boolean(s.poseEdit?.dirty);
      const rigDirty = what !== "clip" && (s.draftSockets !== null || Object.keys(s.draftPlacements).length > 0);
      if (poseDirty || rigDirty) {
        const ok = await confirm({
          title: what === "clip" ? "Open this clip and discard the unsaved poses?" : `Change ${what} and discard the unsaved ${poseDirty ? "poses" : "rig changes"}?`,
          description: poseDirty ? "The poses you edited are not saved." : "Sockets or placements you moved are not saved.",
          confirmLabel: "Discard",
          variant: "danger",
        });
        if (!ok) return false;
      }
      if (s.poseEdit) s.stopPoseEdit();
      if (rigDirty) s.clearDrafts();
      if (what !== "clip" && s.edit.mode !== "off") s.setEdit({ mode: "off", target: null });
      return true;
    },
    [confirm],
  );
}
