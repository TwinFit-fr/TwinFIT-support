"use client";

import { useId, useState } from "react";
import { ChevronDown, FileCheck2, LayoutTemplate, PenLine, PersonStanding, Sparkles } from "lucide-react";
import { DEFAULT_PARAMS } from "@/lib/studio/exercise-templates";
import { originLabel, type AiNotes, type DraftOrigin } from "@/lib/studio/pose-origin";
import { useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";

const ICON: Record<DraftOrigin["kind"], typeof Sparkles> = {
  template: LayoutTemplate,
  ai: Sparkles,
  clip: FileCheck2,
  neutral: PersonStanding,
};

/** The one-line summary of the AI's notes, for the disclosure button. */
function notesSummary(n: AiNotes): string {
  const parts = [
    n.conflicts.length ? `${n.conflicts.length} contradiction${n.conflicts.length === 1 ? "" : "s"} in the texts` : null,
    n.adjusted.length ? `${n.adjusted.length} value${n.adjusted.length === 1 ? "" : "s"} clamped or changed` : null,
    n.checks.length ? `${n.checks.length} body check${n.checks.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.length ? `What the AI read · ${parts.join(" · ")}` : "What the AI read";
}

function NoteList({ title, items, tone }: { title: string; items: string[]; tone?: "warn" }) {
  if (!items.length) return null;
  return (
    <div>
      <p className={cn("text-[10px] font-medium uppercase tracking-[0.12em]", tone === "warn" ? "text-(--m3-warning)" : "text-(--m3-on-surface-variant)")}>{title}</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((item) => (
          <li key={item} className="text-[11px] leading-snug text-(--m3-on-surface)">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Under an AI draft's origin: the model's notes, contradictions it found, what was clamped, in a line that opens. */
function AiNotesLine({ notes }: { notes: AiNotes }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-1.5" data-ai-notes>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="studio-state ml-8 inline-flex max-w-full cursor-pointer items-center gap-1 rounded-(--studio-radius-sm) px-1 text-left text-[11px] leading-snug text-(--m3-tertiary) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/80"
      >
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none", open ? "rotate-0" : "-rotate-90")} aria-hidden="true" />
        <span className="min-w-0">{notesSummary(notes)}</span>
      </button>
      <div id={id} hidden={!open} className="mt-1.5 space-y-2 rounded-(--studio-radius-md) border border-(--m3-tertiary)/25 bg-(--m3-surface-container) px-2.5 py-2">
        <p className="text-[11px] leading-snug text-(--m3-on-surface-variant)">
          The AI read the catalog texts and frames{notes.instructions ? ` and your note “${notes.instructions}”` : ""}, and chose the settings above.
        </p>
        {notes.notes ? <NoteList title="Its notes" items={[notes.notes]} /> : null}
        <NoteList title="Contradictions it found" items={notes.conflicts} tone="warn" />
        <NoteList title="Clamped or changed" items={notes.adjusted} />
        <NoteList title="Server body check" items={notes.checks} tone="warn" />
        {!notes.notes && !notes.conflicts.length && !notes.adjusted.length && !notes.checks.length ? <p className="text-[11px] text-(--m3-on-surface)">No notes: the texts agreed and nothing was clamped.</p> : null}
      </div>
    </div>
  );
}

/**
 * Where the poses on the stage came from, for as long as they are there: the base origin
 * (template, AI draft with its settings, saved clip, neutral pose) and, after the first manual
 * change, "Edited by you" beside it (DraftAiNotes keeps what the model said). All of it comes
 * from the pose document, so undo and redo change it too.
 */
export function DraftOriginLine({ className }: { className?: string }) {
  const origin = useStudioStore((s) => s.poseEdit?.origin ?? null);
  const edited = useStudioStore((s) => s.poseEdit?.edited ?? false);
  if (!origin) return null;
  const label = originLabel(origin, edited, DEFAULT_PARAMS);
  const Icon = ICON[origin.kind];
  return (
    <div className={cn("min-w-0", className)} data-draft-origin={origin.kind} data-edited={edited || undefined}>
      {/* Announced when it changes: a draft landing, the first edit, a save. */}
      <p role="status" aria-live="polite" className="sr-only">
        {label.text}
      </p>
      <div aria-hidden className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-(--studio-radius-md)",
            origin.kind === "ai" ? "bg-(--m3-tertiary-container) text-(--m3-tertiary)" : "bg-(--m3-surface-container-highest) text-(--m3-on-surface)",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-(length:--studio-text-sm) font-semibold leading-tight tracking-tight text-(--m3-on-surface)" title={label.text}>
            {label.base}
          </div>
          {/* Wraps in a narrow pane rather than cutting what the poses are. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] leading-snug">
            {label.detail ? <span className="text-(--m3-on-surface-variant)">{label.detail}</span> : null}
            {edited ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-(--m3-secondary-container) px-1.5 font-medium text-(--m3-on-secondary-container)">
                <PenLine className="h-3 w-3" /> Edited by you
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Under the editor's header, for an AI draft: what the model said, in a line that opens (from the pose document, so undo brings it back too). */
export function DraftAiNotes() {
  const origin = useStudioStore((s) => s.poseEdit?.origin ?? null);
  if (origin?.kind !== "ai") return null;
  const explain = origin.explain ?? (origin.notes ? { notes: origin.notes, conflicts: [], adjusted: [], checks: [], instructions: null } : null);
  if (!explain) return null;
  return <AiNotesLine notes={explain} />;
}
