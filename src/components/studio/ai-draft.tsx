"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Sparkles, X } from "lucide-react";
import { elapsedLabel } from "@/lib/studio/ai-draft-request";
import { useAiDraftStore } from "@/lib/studio/ai-draft-store";
import { originLabel } from "@/lib/studio/pose-origin";
import { cn } from "@/lib/utils";
import { useAiDraft } from "./hooks/use-ai-draft";
import { M3Button, TextInput } from "./ui";

/** The seconds a draft has been running, ticking once a second while it runs. */
function useElapsed(startedAt: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  return startedAt === null ? null : elapsedLabel(startedAt, Math.max(now, startedAt));
}

/**
 * "Draft with AI", in the settings group: an optional note for the model and the button. While the
 * model works (about ten seconds) the editor stays usable, the row says so and offers Cancel; an
 * answer that would replace work made by hand waits here as a suggestion.
 */
export function AiDraftControl({ templated }: { templated: boolean }) {
  const pending = useAiDraftStore((s) => s.pending);
  const failure = useAiDraftStore((s) => s.failure);
  const suggestion = useAiDraftStore((s) => s.suggestion);
  const { start, cancel, apply, dismiss } = useAiDraft();
  const [note, setNote] = useState("");
  const elapsed = useElapsed(pending?.startedAt ?? null);
  const send = () => void start(note);

  return (
    <div className="mt-3 border-t border-(--m3-outline-variant) pt-3" data-ai-draft={pending ? "pending" : suggestion ? "suggestion" : "idle"}>
      <div className="flex items-center gap-2">
        <TextInput
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !pending) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={templated ? "Optional note: deeper, wide stance, slow down…" : "Optional note: wide grip, pause at the bottom…"}
          aria-label="Optional note for the AI draft"
          maxLength={2000}
          className="h-8 min-w-0 flex-1 px-2.5 py-0 text-[11px]"
        />
        {pending ? (
          <M3Button size="sm" variant="outlined" onClick={cancel} aria-label="Cancel the AI draft" className="border-(--m3-tertiary)/60 text-(--m3-tertiary)">
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
          </M3Button>
        ) : (
          <M3Button size="sm" variant="filled" onClick={send} className="bg-(--m3-tertiary) text-[#062b22]" data-ai-draft-start>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Draft with AI
          </M3Button>
        )}
      </div>
      {pending ? (
        <div className="mt-2">
          <p className="text-[11px] leading-snug text-(--m3-on-surface-variant)">
            <Sparkles className="mr-1.5 inline h-3 w-3 -translate-y-px text-(--m3-tertiary) studio-pulse" aria-hidden="true" />
            <span className="whitespace-nowrap font-medium text-(--m3-on-surface)">AI is drafting</span> <span className="whitespace-nowrap tabular-nums">{elapsed}</span> · usually about 10 s · keep editing meanwhile
          </p>
          <div className="ai-draft-track mt-1.5" aria-hidden="true">
            <span className="ai-draft-fill" />
          </div>
        </div>
      ) : failure ? (
        <p className="mt-2 flex items-center gap-2 text-[11px] leading-snug text-(--m3-error)" role="alert">
          <span className="min-w-0 flex-1">The AI draft failed: {failure.message}</span>
          <M3Button size="sm" variant="text" onClick={() => void start(failure.request.instructions)} className="h-7 px-2 text-(--m3-primary)">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </M3Button>
        </p>
      ) : suggestion ? null : (
        <p className="mt-1.5 text-[11px] leading-snug text-(--m3-on-surface-variant)">
          {templated
            ? "The AI reads the catalog texts and frames and sets these settings for you; your note steers it. Undo takes it back."
            : "No template for this exercise: the AI writes the key poses as joint angles. Undo takes it back."}
        </p>
      )}
      {/* Said once per state, not on every tick of the timer. */}
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? "AI is drafting. You can keep editing; Cancel stops it." : suggestion ? `AI draft ready below the settings. ${suggestion.summary}` : ""}
      </p>
      {suggestion ? <AiSuggestionCard summary={suggestion.summary} label={originLabel(suggestion.next.origin, false).detail} onApply={apply} onDismiss={dismiss} /> : null}
    </div>
  );
}

/** An answer that would replace work made by hand: what it is, what applying replaces, Apply or Dismiss. */
function AiSuggestionCard({ summary, label, onApply, onDismiss }: { summary: string; label: string | null; onApply: () => void; onDismiss: () => void }) {
  return (
    <div role="region" aria-label="AI draft ready" className="mt-2.5 rounded-(--studio-radius-lg) border border-(--m3-tertiary)/45 bg-(--m3-tertiary-container)/35 p-2.5" data-ai-suggestion>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--m3-tertiary-container) text-(--m3-tertiary)">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold leading-snug text-(--m3-on-surface)">AI draft ready{label ? `: ${label}` : ""}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-(--m3-on-surface)/85">{summary}</p>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <M3Button size="sm" variant="text" onClick={onDismiss} className="text-(--m3-on-surface)">
          Dismiss
        </M3Button>
        <M3Button size="sm" variant="filled" onClick={onApply} className="bg-(--m3-tertiary) text-[#062b22]" data-ai-apply>
          Apply
        </M3Button>
      </div>
    </div>
  );
}

/** A small chip wherever the draft should be visible (the editor header, the stage): running time and Cancel, or "ready". */
export function AiDraftChip({ className, onReview }: { className?: string; onReview?: () => void }) {
  const pending = useAiDraftStore((s) => s.pending);
  const ready = useAiDraftStore((s) => Boolean(s.suggestion));
  const elapsed = useElapsed(pending?.startedAt ?? null);
  const { cancel } = useAiDraft();
  if (!pending && !(ready && onReview)) return null;
  return (
    <div className={cn("relative inline-flex h-7 shrink-0 items-center gap-1.5 overflow-hidden rounded-full border border-(--m3-tertiary)/40 bg-(--m3-tertiary-container)/70 pl-2.5 text-[11px] text-(--m3-on-surface)", pending ? "pr-0.5" : "pr-2.5", className)} data-ai-chip>
      <Sparkles className={cn("h-3 w-3 text-(--m3-tertiary)", pending && "studio-pulse")} aria-hidden="true" />
      {pending ? (
        <>
          <span className="font-medium">AI drafting</span>
          <span className="tabular-nums text-(--m3-on-surface-variant)">{elapsed}</span>
          <span className="ai-draft-track absolute inset-x-3 bottom-0 h-0.5" aria-hidden="true">
            <span className="ai-draft-fill" />
          </span>
          <button
            type="button"
            onClick={cancel}
            className="studio-state ml-0.5 inline-flex h-6 cursor-pointer items-center rounded-full px-2 font-medium text-(--m3-tertiary) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/80"
          >
            Cancel
          </button>
        </>
      ) : (
        <button type="button" onClick={onReview} className="cursor-pointer font-medium outline-none focus-visible:underline">
          AI draft ready · review
        </button>
      )}
    </div>
  );
}
