"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";

/**
 * What the body checks say about the poses on this avatar (pose-validate.ts): the failures and
 * warnings, or plainly that every check passes, so a change of setting or a drag can be seen to
 * keep the feet on the floor, the joints in range and the body balanced. While the poses are
 * still settling it says the checks are running instead of showing the previous result.
 */
export function BodyChecks() {
  const issues = useStudioStore((s) => s.poseIssues);
  const pending = useStudioStore((s) => s.poseChecksPending);
  const errors = issues.filter((issue) => issue.severity === "error");
  const ok = issues.length === 0;
  return (
    <section aria-label="Body checks" className="border-t border-(--m3-outline-variant) px-4 py-2.5" data-body-checks={pending ? "pending" : ok ? "pass" : errors.length ? "fail" : "warn"}>
      <div
        role="status"
        className={cn(
          "flex items-start gap-1.5 text-[11px] leading-snug font-medium",
          pending ? "text-(--m3-on-surface-variant)" : ok ? "text-(--m3-success)" : errors.length ? "text-(--m3-error)" : "text-(--m3-warning)",
        )}
      >
        {ok && !pending ? <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span className="min-w-0">
          {pending
            ? "Body checks: checking the new poses…"
            : ok
              ? "Body checks pass"
              : errors.length
                ? `Body checks: ${errors.length} failed`
                : `Body checks: ${issues.length} warning${issues.length === 1 ? "" : "s"}`}
          {/* In the same line of text, so a narrow pane wraps it as a sentence. */}
          {ok && !pending ? <span className="font-normal text-(--m3-on-surface-variant)"> · feet on the floor, joints in range, balanced</span> : null}
        </span>
      </div>
      {!ok && !pending ? (
        <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-(--m3-on-surface-variant)">
          {issues.slice(0, 6).map((issue) => (
            <li key={issue.code} className={issue.severity === "error" ? "text-(--m3-error)" : undefined}>
              {issue.message}
            </li>
          ))}
          {issues.length > 6 ? <li>and {issues.length - 6} more</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
