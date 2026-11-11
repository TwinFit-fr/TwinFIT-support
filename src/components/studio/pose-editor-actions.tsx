"use client";

import { useEffect } from "react";
import { Check, RotateCcw, Save } from "lucide-react";
import { M3Button } from "./ui";

export type SaveMode = "replace" | "copy";

/**
 * The editor's footer, pinned under the scrolling controls so Save is always in view: one click
 * stores the poses (a new clip for a draft, an overwrite for a clip opened from the list).
 * Revert drops the changes and goes back to where the poses came from.
 */
export function PoseEditorActions({
  quiet = false,
  vectorId,
  sourceSeq,
  dirty,
  saving,
  onSave,
  onRevert,
}: {
  /** Not the next step yet (a neutral pose waiting for its AI draft): Save stays available but does not compete. */
  quiet?: boolean;
  vectorId: string | null;
  sourceSeq: number | null;
  dirty: boolean;
  saving: boolean;
  onSave: (mode: SaveMode) => void;
  onRevert: () => void;
}) {
  const saved = vectorId !== null && !dirty;
  // Ctrl/Cmd+S saves from anywhere on the page (instead of the browser's "save page").
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (!saving && !saved) onSave(vectorId ? "replace" : "copy");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave, saving, saved, vectorId]);
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-(--m3-outline-variant) bg-(--m3-surface-container-low) px-3 py-2.5">
      <M3Button variant="text" size="sm" onClick={onRevert} disabled={saving || !dirty} title="Drop your changes and go back to where these poses came from" className="px-2.5">
        <RotateCcw className="h-3.5 w-3.5" /> Revert
      </M3Button>
      <span className="ml-auto" />
      {saved ? (
        <span className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] text-(--m3-success)" data-save-state="saved">
          <Check className="h-3.5 w-3.5 shrink-0" /> Saved
        </span>
      ) : null}
      {vectorId && dirty ? (
        <M3Button variant="text" size="sm" onClick={() => onSave("copy")} disabled={saving} title="Keep the original clip and save these poses as another one" className="px-2.5">
          Save as copy
        </M3Button>
      ) : null}
      <M3Button
        variant={quiet ? "tonal" : "filled"}
        onClick={() => onSave(vectorId ? "replace" : "copy")}
        busy={saving}
        disabled={saved}
        aria-keyshortcuts="Control+S"
        title={vectorId ? `Overwrite clip #${sourceSeq} (Ctrl+S)` : "Save these poses as a new clip of this exercise (Ctrl+S)"}
        className="px-4"
      >
        {saving ? null : <Save className="h-4 w-4" />} Save
      </M3Button>
    </div>
  );
}
