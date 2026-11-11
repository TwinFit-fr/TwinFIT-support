/**
 * What rebuilding the poses from the template would replace, and how the editor says it: before a
 * change (the settings group, the stage), while a drag changes a setting, and after (the toast).
 * Also the drag mode in force, which follows the same rule: a drag drives the exercise settings
 * unless the user has edited the poses by hand. Pure.
 */

import type { DraftOrigin } from "./pose-origin.ts";

export type DragMode = "exercise" | "limb";

/**
 * What a rebuild replaces: "edits" the user made by hand, the poses of a saved "clip" that differ
 * from the template, or a "draft" that is not the template's (angles written by the AI); null
 * when the poses are the template's own and nothing would be lost.
 */
export type Replaced = "edits" | "clip" | "draft" | null;

export function replacedBy(origin: DraftOrigin, edited: boolean, differs: boolean): Replaced {
  if (!differs) return null;
  if (edited) return "edits";
  return origin.kind === "clip" ? "clip" : "draft";
}

/**
 * The mode in force: Limb when the exercise has no setting to drag, else the user's choice, else
 * Exercise unless the poses hold edits made by hand (a saved clip opened as it was still drags its
 * settings: the rebuild says what it replaces and undo brings the clip back).
 */
export function effectiveDragMode(choice: DragMode | null, draggable: boolean, replaced: Replaced): DragMode {
  if (!draggable) return "limb";
  return choice ?? (replaced === "edits" ? "limb" : "exercise");
}

const WHAT: Record<Exclude<Replaced, null>, string> = {
  edits: "your manual edits",
  clip: "the saved clip's poses",
  draft: "the draft's poses",
};

/** Before anything is touched, in the settings group. */
export function rebuildWarning(replaced: Replaced): string | null {
  if (replaced === "edits") return "These poses have manual edits. Changing a setting, here or by dragging the body, rebuilds every pose from the template and replaces them; Ctrl+Z brings them back.";
  if (replaced === "clip") return "This saved clip is not exactly the template. Changing a setting, here or by dragging the body, rebuilds every pose from the template; Ctrl+Z brings the clip back.";
  if (replaced === "draft") return "These poses are not the template's. Changing a setting, here or by dragging the body, rebuilds every pose from the template; Ctrl+Z brings them back.";
  return null;
}

/** Short, for the stage status while a drag changes a setting (the stage is narrow): "replaces the saved clip". */
const SHORT: Record<Exclude<Replaced, null>, string> = { edits: "your edits", clip: "the saved clip", draft: "the draft" };

export function replacesNote(replaced: Replaced): string | null {
  return replaced ? `replaces ${SHORT[replaced]}` : null;
}

/** After the rebuild, in the toast next to Undo. */
export function rebuildToast(replaced: Replaced, change: string | null): string | null {
  if (!replaced) return null;
  return `${change ? `${change}. ` : ""}Every pose was rebuilt from the template and ${WHAT[replaced]} were replaced.`;
}
