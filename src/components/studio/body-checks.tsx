"use client";

import { useState } from "react";
import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { listWords, reportHeadline, type BodyIssue } from "@/lib/studio/body-issues";
import { POINT_LABEL, isPointId } from "@/lib/studio/pose-points";
import { useStudioStore, type StudioState } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { focusIssue } from "./body-check-actions";
import { IssueGlyph } from "./issue-glyph";

/** Where the playhead rests, for marking the problem in front of the user: a held pose or a moment. */
type Rest = { pose: number } | { t: number } | null;

/** A string, so a playhead running during playback does not re-render the list. */
function restOf(s: StudioState): string {
  if (s.playing || !s.poseEdit) return "";
  return s.scrubTime !== null ? `t${s.scrubTime}` : `p${s.poseEdit.keyframe}`;
}

function parseRest(key: string): Rest {
  if (!key) return null;
  return key.startsWith("t") ? { t: Number(key.slice(1)) } : { pose: Number(key.slice(1)) };
}

function inFront(issue: BodyIssue, selected: string | null, rest: Rest): boolean {
  if (selected !== issue.point || !rest) return false;
  if ("pose" in rest) return issue.pose === rest.pose;
  return issue.spans.some((s) => rest.t >= s.from - 1e-6 && rest.t <= s.to + 1e-6);
}

/** One problem as a list item: what, when and how much; choosing it goes there and selects the part. */
function IssueItem({ issue, current, onChoose }: { issue: BodyIssue; current: boolean; onChoose: (issue: BodyIssue) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onChoose(issue)}
        aria-current={current ? "true" : undefined}
        data-body-issue={issue.id}
        className={cn(
          "studio-state flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)",
          current ? "bg-(--m3-surface-container-highest)" : "hover:bg-(--m3-surface-container-high)",
        )}
      >
        <IssueGlyph severity={issue.severity} size={15} className="mt-px" />
        <span className="min-w-0 flex-1 text-[11px] leading-snug">
          <span className={cn("block font-semibold", issue.severity === "error" ? "text-(--m3-error)" : "text-(--m3-warning)")}>
            {issue.title}
            <span className="sr-only">{issue.severity === "error" ? " (problem)" : " (warning)"}</span>
          </span>
          <span className="block text-(--m3-on-surface-variant)">
            <span className="font-medium text-(--m3-on-surface)">{issue.where}</span> · {issue.detail}
          </span>
          {/* The problem in front of the user says what to do; the others say it once chosen (and to screen readers now). */}
          <span className={cn("block", current ? "mt-0.5 text-(--m3-on-surface)" : "sr-only")} data-issue-fix>
            {`Fix: ${issue.fix}${current ? ` · ${POINT_LABEL[issue.point]} selected` : ""}`}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * What the body checks say about the poses on this avatar (pose-validate.ts, located by
 * body-issues.ts): each problem in plain words with its pose or moment, as a list where choosing
 * one moves the playhead there and selects the body point that fixes it; and plainly which checks
 * did not run for this kind of exercise, so "nothing found" is never read as "checked". While the
 * poses settle the previous result stays, dimmed, and the status says the checks are running.
 */
export function BodyChecks() {
  const report = useStudioStore((s) => s.bodyReport);
  const pending = useStudioStore((s) => s.poseChecksPending);
  const selected = useStudioStore((s) => (s.poseEdit && isPointId(s.poseEdit.dragTarget) ? s.poseEdit.dragTarget : null));
  const rest = parseRest(useStudioStore(restOf));
  const [message, setMessage] = useState("");
  const headline = reportHeadline(report);
  const issues = report?.issues ?? [];
  const tone = pending ? "pending" : headline.tone;
  const choose = (issue: BodyIssue) => setMessage(focusIssue(issue));
  return (
    <section aria-labelledby="body-checks-title" className="border-t border-(--m3-outline-variant) pb-1.5" data-body-checks={tone}>
      <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
        <h3 id="body-checks-title" className="shrink-0 text-[11px] font-semibold tracking-[0.12em] text-(--m3-on-surface-variant) uppercase">
          Body checks
        </h3>
        <p
          role="status"
          className={cn(
            "ml-auto flex min-w-0 items-center gap-1.5 text-right text-[11px] leading-snug font-medium",
            pending ? "text-(--m3-on-surface-variant)" : { pass: "text-(--m3-success)", partial: "text-(--m3-on-surface)", warn: "text-(--m3-warning)", fail: "text-(--m3-error)" }[headline.tone],
          )}
        >
          {pending ? null : headline.tone === "pass" ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : headline.tone === "partial" ? (
            <ShieldQuestion className="h-3.5 w-3.5 shrink-0 text-(--m3-on-surface-variant)" aria-hidden="true" />
          ) : (
            <IssueGlyph severity={headline.tone === "fail" ? "error" : "warning"} size={13} />
          )}
          <span className="min-w-0">{pending ? "Checking the new poses…" : headline.text}</span>
        </p>
      </div>
      {issues.length ? (
        <ul aria-label="Body check problems" className={cn("space-y-px px-2", pending && "opacity-60")}>
          {issues.map((issue) => (
            <IssueItem key={issue.id} issue={issue} current={inFront(issue, selected, rest)} onChoose={choose} />
          ))}
        </ul>
      ) : headline.tone === "pass" && !pending ? (
        <p className="px-4 text-[11px] leading-snug text-(--m3-on-surface-variant)">Feet on the floor, joints in range, balanced, both sides alike.</p>
      ) : null}
      {report && (report.skipped.length || report.partial) ? (
        <div className={cn("px-4 pt-1.5 text-[11px] leading-snug text-(--m3-on-surface-variant)", pending && "opacity-60")} data-body-coverage>
          {report.skipped.length ? (
            <ul aria-label="Checks not run" className="space-y-1.5">
              {report.skipped.map((note) => (
                <li key={note.checks.join()}>
                  <p className="font-medium text-(--m3-on-surface)">
                    Not checked: <span className="font-normal">{listWords(note.checks)}</span>
                  </p>
                  <p>{note.why}</p>
                </li>
              ))}
            </ul>
          ) : null}
          {report.partial ? <p className={cn(report.skipped.length > 0 && "mt-1")}>{report.partial}</p> : null}
          <p className="mt-1">
            <span className="font-medium text-(--m3-on-surface)">Checked:</span> {listWords(report.ran)}.
          </p>
        </div>
      ) : null}
      <div className="sr-only" aria-live="polite">
        {message}
      </div>
    </section>
  );
}
