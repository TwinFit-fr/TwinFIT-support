"use client";

import { PauseCircle, PersonStanding } from "lucide-react";
import { useStudioStore } from "@/lib/studio/store";
import { M3Button } from "./ui";

/**
 * At the top of the rig editor: posing and rig editing never run at once, and this says so
 * instead of leaving pose controls that do nothing. The poses wait as they are (unsaved ones too);
 * "Back to posing" closes the rig editor through the unsaved-work guard.
 */
export function RigModeNote({ onBack, disabled = false }: { onBack: () => void; disabled?: boolean }) {
  const count = useStudioStore((s) => s.poseEdit?.poses.length ?? 0);
  const dirty = useStudioStore((s) => Boolean(s.poseEdit?.dirty));
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-(--m3-outline-variant) bg-(--m3-surface-container) p-2.5" data-rig-mode-note>
      <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-(--m3-warning)" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="leading-snug text-(--m3-on-surface-variant)">
          <span className="font-semibold text-(--m3-on-surface)">Posing is paused.</span> The avatar stands in its rest pose so attachment points are placed on a still body.
          {count ? ` Your ${count === 1 ? "pose waits" : `${count} poses wait`} as ${count === 1 ? "it is" : "they are"}${dirty ? ", unsaved changes included" : ""}.` : ""}
        </p>
        <M3Button variant="tonal" size="sm" onClick={onBack} disabled={disabled} data-back-to-posing>
          <PersonStanding className="h-3.5 w-3.5" aria-hidden="true" /> Back to posing
        </M3Button>
      </div>
    </div>
  );
}
