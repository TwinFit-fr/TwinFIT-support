"use client";

import { useCallback } from "react";
import { useConfirm } from "@/components/ui/confirm";
import { rigDirty } from "@/lib/studio/rig-history";
import { useStudioStore } from "@/lib/studio/store";

/**
 * What is about to change:
 * - "exercise", "avatar": both editors' drafts go.
 * - "clip": another clip opens in the pose editor; that starts posing, so an open rig editor closes too.
 * - "rig-close": the rig editor closes (to pose again); only its own changes are at stake.
 */
export type GuardChange = "exercise" | "avatar" | "clip" | "rig-close";

/**
 * Changing exercise, avatar or the clip in the editor, or leaving the rig editor, while unsaved
 * work would be dropped asks first; on yes the drafts are dropped and the change goes through.
 * An untouched automatic draft is not unsaved work: it goes without a question. Returns false
 * when the user kept their work. Posing and rig editing never run at once: whatever starts posing
 * closes the rig editor through here.
 */
export function useSelectionGuard() {
  const confirm = useConfirm();
  return useCallback(
    async (what: GuardChange): Promise<boolean> => {
      const s = useStudioStore.getState();
      const rigOpen = s.edit.mode !== "off";
      const dropsPoses = what !== "rig-close" && Boolean(s.poseEdit?.dirty);
      const closesRig = what === "exercise" || what === "avatar" || rigOpen;
      const dropsRig = closesRig && rigDirty({ sockets: s.draftSockets, placements: s.draftPlacements });
      if (dropsPoses || dropsRig) {
        const unsaved = dropsPoses && dropsRig ? "poses and rig changes" : dropsPoses ? "poses" : "rig changes";
        const ok = await confirm({
          title:
            what === "rig-close"
              ? "Leave the rig editor and discard the rig changes?"
              : what === "clip"
                ? `Open this clip and discard the unsaved ${unsaved}?`
                : `Change ${what} and discard the unsaved ${unsaved}?`,
          description:
            dropsPoses && dropsRig
              ? "The poses you edited and the attachment points or placements you moved are not saved."
              : dropsPoses
                ? "The poses you edited are not saved."
                : "Attachment points or placements you moved are not saved. Save them in the rig editor first to keep them.",
          confirmLabel: "Discard",
          variant: "danger",
        });
        if (!ok) return false;
      }
      if (what !== "rig-close" && s.poseEdit) s.stopPoseEdit();
      if (dropsRig) s.clearDrafts();
      if (closesRig && s.edit.mode !== "off") s.setEdit({ mode: "off", target: null });
      return true;
    },
    [confirm],
  );
}
