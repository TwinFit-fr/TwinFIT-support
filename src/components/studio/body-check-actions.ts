"use client";

import { showsAt, type BodyIssue } from "@/lib/studio/body-issues";
import { seek } from "@/lib/studio/playback";
import { POINT_LABEL } from "@/lib/studio/pose-points";
import { formatSeconds } from "@/lib/studio/timeline";
import { useStudioStore } from "@/lib/studio/store";

/**
 * Go to a body-check problem: the playhead to its pose (or the moment it is worst) and its body
 * point selected, so the point's properties and Back to automatic are right there. Returns what
 * to announce.
 */
export function focusIssue(issue: BodyIssue): string {
  seek(issue.t);
  useStudioStore.getState().setPoseDragTarget(issue.point);
  const on = issue.pose !== null ? issue.where : `the moment at ${formatSeconds(issue.t)}`;
  return `${issue.title}: ${issue.detail}. Now on ${on}, ${POINT_LABEL[issue.point].toLowerCase()} selected to fix it.`;
}

/** Is this problem the one in front of the user: its point selected and the playhead on it? */
export function isFocused(issue: BodyIssue, selected: string | null, t: number, tolerance: number): boolean {
  return selected === issue.point && showsAt(issue, t, tolerance);
}
