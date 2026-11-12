/**
 * What rebuilding the poses from the template would replace, and how the editor says it: before a
 * change (the settings group, the stage), while a drag changes a setting, and after (the toast).
 * Also the drag mode in force, which follows the same rule: a drag drives the exercise settings
 * unless the user has edited the poses by hand. Pure.
 */

import type { RebuildMatch } from "./point-state.ts";
import type { DraftOrigin } from "./pose-origin.ts";

export type DragMode = "exercise" | "limb";

/**
 * What a rebuild replaces: "edits" the user made by hand, the poses of a saved "clip" that differ
 * from the template, the key poses read from a "capture", or a "draft" that is not the template's
 * (angles written by the AI); null when the poses are the template's own and nothing would be lost.
 */
export type Replaced = "edits" | "clip" | "capture" | "draft" | null;

export function replacedBy(origin: DraftOrigin, edited: boolean, differs: boolean): Replaced {
  if (!differs) return null;
  if (edited) return "edits";
  return origin.kind === "clip" ? "clip" : origin.kind === "capture" ? "capture" : "draft";
}

/**
 * The mode in force: Limb when the exercise has no setting to drag, else the user's choice, else
 * Exercise unless the poses hold edits made by hand (a saved clip opened as it was still drags its
 * settings: the rebuild says what it replaces and undo brings the clip back).
 */
export function effectiveDragMode(choice: DragMode | null, draggable: boolean, replaced: Replaced): DragMode {
  if (!draggable) return "limb";
  // A capture's key poses are the capture: a drag moves the limb, it does not rebuild them from the template.
  return choice ?? (replaced === "edits" || replaced === "capture" ? "limb" : "exercise");
}

const WHAT: Record<Exclude<Replaced, null>, string> = {
  edits: "your manual edits",
  clip: "the saved clip's poses",
  capture: "the key poses from the capture",
  draft: "the draft's poses",
};

const posesWord = (n: number) => `${n} pose${n === 1 ? "" : "s"}`;
const CHANGING = "Changing a setting, here or by dragging the body,";

/**
 * Before anything is touched, in the settings group: what a setting change cannot keep, and why.
 * Nothing when the poses match the template one to one, since what was set by hand is then kept
 * (point-state.ts); only a pose added or removed, or poses not built from the template, lose work.
 */
export function rebuildWarning(replaced: Replaced, match: RebuildMatch | null = null): string | null {
  if (!replaced || match?.kind === "match") return null;
  if (replaced === "capture") return "These key poses come from the capture. Changing a template setting, here or by dragging the body in Exercise mode, rebuilds them from the template instead; Ctrl+Z brings them back.";
  const back = replaced === "clip" ? "Ctrl+Z brings the clip back." : "Ctrl+Z brings them back.";
  if (match?.kind === "count") {
    const { poses, built } = match;
    const diff = Math.abs(poses - built);
    const why = replaced === "clip" ? `This saved clip has ${posesWord(poses)} and the template builds ${built}` : `You ${poses > built ? "added" : "removed"} ${posesWord(diff)}: there are ${poses} and the template builds ${built}`;
    const lost =
      replaced === "clip"
        ? "the clip's own poses are replaced"
        : poses > built
          ? `the ${diff === 1 ? "added pose" : `${diff} added poses`} and every change made by hand are replaced`
          : "every change made by hand is replaced";
    return `${why}, so the poses cannot be matched. ${CHANGING} rebuilds the template's ${posesWord(built)}: ${lost}. ${back}`;
  }
  if (match?.kind === "no-base") {
    const why = replaced === "clip" ? "This saved clip does not say which settings built it" : replaced === "edits" ? "These poses were not built from the template, so your manual edits" : "These poses were not built from the template";
    const tail = replaced === "edits" ? " cannot be matched to it." : ", so nothing in them can be matched to it.";
    return `${why}${tail} ${CHANGING} replaces all ${posesWord(match.poses)} with the template's. ${back}`;
  }
  if (replaced === "edits") return "These poses have manual edits. Changing a setting, here or by dragging the body, rebuilds every pose from the template and replaces them; Ctrl+Z brings them back.";
  if (replaced === "clip") return "This saved clip is not exactly the template. Changing a setting, here or by dragging the body, rebuilds every pose from the template; Ctrl+Z brings the clip back.";
  return "These poses are not the template's. Changing a setting, here or by dragging the body, rebuilds every pose from the template; Ctrl+Z brings them back.";
}

/** Short, for the stage status while a drag changes a setting (the stage is narrow): "replaces the saved clip". */
const SHORT: Record<Exclude<Replaced, null>, string> = { edits: "your edits", clip: "the saved clip", capture: "the capture's poses", draft: "the draft" };

export function replacesNote(replaced: Replaced): string | null {
  return replaced ? `replaces ${SHORT[replaced]}` : null;
}

/**
 * After the rebuild, in the toast next to Undo: what it replaced, or what it kept of what was set
 * by hand (`kept`, from keptSummary); nothing to say for a plain change of the template's poses.
 */
export function rebuildToast(replaced: Replaced, change: string | null, kept: string | null = null): string | null {
  if (!replaced) return kept ? `${change ? `${change}. ` : ""}${kept}` : null;
  return `${change ? `${change}. ` : ""}Every pose was rebuilt from the template and ${WHAT[replaced]} were replaced.`;
}
