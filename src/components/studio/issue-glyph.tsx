import type { Severity } from "@/lib/studio/body-issues";
import { cn } from "@/lib/utils";

/**
 * The mark of a failing body check: a warning triangle with an exclamation mark, filled for a
 * failure and hollow for a warning, so the two read apart without colour. The same glyph on the
 * stage, on the timeline and in the panel list. Decorative: the text next to it says it.
 */
export function IssueGlyph({ severity, size = 14, className }: { severity: Severity; size?: number; className?: string }) {
  const fail = severity === "error";
  return (
    <svg className={cn("issue-glyph", className)} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" data-severity={severity}>
      <path
        d="M8 1.4c.4 0 .8.2 1 .6l6.2 11c.4.8-.1 1.7-1 1.7H1.8c-.9 0-1.4-.9-1-1.7L7 2c.2-.4.6-.6 1-.6Z"
        fill={fail ? "var(--check-fail)" : "var(--check-edge)"}
        stroke={fail ? "var(--check-edge)" : "var(--check-warn)"}
        strokeWidth={fail ? 1.1 : 1.6}
        strokeLinejoin="round"
      />
      <path d="M8 5.6v4" stroke={fail ? "var(--check-edge)" : "var(--check-warn)"} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="12.1" r="1.05" fill={fail ? "var(--check-edge)" : "var(--check-warn)"} />
    </svg>
  );
}
