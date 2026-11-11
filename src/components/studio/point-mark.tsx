import { cn } from "@/lib/utils";

export type MarkKind = "automatic" | "set" | "pinned" | "limit" | "plain";

/** What each state of a body point means, in the words the legend and the properties use. */
export const MARK_WORDS: Record<Exclude<MarkKind, "plain">, { label: string; meaning: string }> = {
  automatic: { label: "Automatic", meaning: "This part is exactly what the exercise template or the AI draft produced." },
  set: { label: "Set by you", meaning: "Its joints differ from that automatic pose. A setting change or an AI draft keeps them." },
  pinned: { label: "Pinned", meaning: "Held in place while the rest of the body moves." },
  limit: { label: "At its limit", meaning: "While you drag: the body cannot take this point any further." },
};

/**
 * The mark of a body point state, drawn small (the legend, the properties): the same shape and
 * colour as on the stage, so it reads without colour too. Decorative: the text next to it says it.
 */
export function PointMark({ kind, size = 14, className }: { kind: MarkKind; size?: number; className?: string }) {
  const edge = "#03100c";
  return (
    <svg className={cn("point-mark", className)} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {kind === "automatic" || kind === "plain" ? <circle cx="8" cy="8" r="5" fill="var(--pose-auto)" stroke={edge} strokeWidth="1.5" /> : null}
      {kind === "set" ? <rect x="3.9" y="3.9" width="8.2" height="8.2" rx="1.2" transform="rotate(45 8 8)" fill="var(--pose-set)" stroke={edge} strokeWidth="1.5" /> : null}
      {kind === "pinned" ? (
        <>
          <rect x="1.75" y="1.75" width="12.5" height="12.5" rx="2" fill="none" stroke="var(--pose-pin)" strokeWidth="2" />
          <circle cx="8" cy="8" r="3.1" fill="var(--pose-auto)" stroke={edge} strokeWidth="1.25" />
        </>
      ) : null}
      {kind === "limit" ? (
        <>
          <circle cx="8" cy="8" r="6.4" fill="none" stroke="var(--pose-limit)" strokeWidth="1.75" strokeDasharray="2.6 2" />
          <circle cx="8" cy="8" r="3.1" fill="var(--m3-warning)" stroke={edge} strokeWidth="1.25" />
        </>
      ) : null}
    </svg>
  );
}

/** Why a pose has no automatic pose to compare with, in one sentence. */
export function noAutoWords(missing: "no-template" | "unmatched" | null): string {
  return missing === "unmatched"
    ? "A pose was added or removed, so the poses no longer match the template's one to one: there is no automatic pose to compare with."
    : "These poses were not built from the exercise template, so there is no automatic pose to compare with.";
}
