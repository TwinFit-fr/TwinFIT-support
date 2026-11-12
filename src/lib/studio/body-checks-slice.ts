// The body checks' part of the studio store: what the validator says about the clip on screen,
// located on the body, and whether that result is out of date.
import type { BodyReport } from "./body-issues";
import { sameJson } from "./same-json.ts";
import type { PoseIssue } from "./pose-validate";

/** The latest body-check result on the avatar's own rig, and whether the poses changed since it ran. */
export type BodyChecksSlice = {
  /** What the validator says about the clip on screen, on the avatar's own rig. */
  poseIssues: PoseIssue[];
  /** The same checks located: which part, which pose or stretch, which checks did not run (body-issues.ts). */
  bodyReport: BodyReport | null;
  /** The poses changed and the body checks have not run on them yet (poseIssues is the previous result). */
  poseChecksPending: boolean;

  /** The result of the body checks on the poses as they are now, with where they fail (clears poseChecksPending). */
  setPoseChecks: (issues: PoseIssue[], report: BodyReport | null) => void;
  /** The poses changed: the body checks will run again once the edits settle. */
  markPoseChecksPending: () => void;
};

type BodyChecksSet = (fn: (s: BodyChecksSlice) => Partial<BodyChecksSlice>) => void;

export function createBodyChecksSlice(set: BodyChecksSet): BodyChecksSlice {
  return {
    poseIssues: [],
    bodyReport: null,
    poseChecksPending: false,

    setPoseChecks: (poseIssues, bodyReport) =>
      set((s) => {
        const same = sameJson(s.poseIssues, poseIssues) && sameJson(s.bodyReport, bodyReport);
        return same ? (s.poseChecksPending ? { poseChecksPending: false } : s) : { poseIssues, bodyReport, poseChecksPending: false };
      }),
    markPoseChecksPending: () => set((s) => (s.poseChecksPending ? s : { poseChecksPending: true })),
  };
}
