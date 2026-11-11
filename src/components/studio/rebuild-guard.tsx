"use client";

import { useEffect, useRef } from "react";
import { Lock, RefreshCcw } from "lucide-react";
import { guardConsequence, guardDragQuestion, guardNotice, guardQuestion, type ClipGuard } from "@/lib/studio/rebuild-guard";
import { M3Button } from "./ui";

type Locked = Extract<ClipGuard, { locked: true }>;

/** Under the settings of a locked saved clip: why nothing rebuilds it, and the one way to do it. */
export function ClipGuardNotice({ guard, onRebuild }: { guard: Locked; onRebuild: () => void }) {
  return (
    <div className="mb-2.5 flex items-start gap-2 rounded-(--studio-radius-md) border border-(--m3-outline) bg-(--m3-surface-container) px-2.5 py-2" data-clip-guard>
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--m3-on-surface-variant)" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-snug text-(--m3-on-surface)">{guardNotice(guard)}</p>
        <M3Button size="sm" variant="outlined" onClick={onRebuild} className="mt-1.5 h-7 px-2.5 text-[11px]">
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Rebuild from template
        </M3Button>
      </div>
    </div>
  );
}

/**
 * The inline confirm before the first rebuild of a locked clip: the question, what it replaces,
 * Rebuild or Keep. The safe choice has the focus; Escape keeps the clip.
 */
export function RebuildConfirm({ guard, change, onConfirm, onCancel }: { guard: Locked; change: string | null; onConfirm: () => void; onCancel: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.querySelector<HTMLButtonElement>("[data-keep]")?.focus(), []);
  return (
    <div
      ref={box}
      role="alertdialog"
      aria-labelledby="rebuild-confirm-question"
      aria-describedby="rebuild-confirm-detail"
      className="mb-2.5 rounded-(--studio-radius-md) border border-(--m3-warning)/50 bg-(--m3-warning)/10 px-2.5 py-2"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      data-rebuild-confirm
    >
      <p id="rebuild-confirm-question" className="text-[12px] font-semibold leading-snug text-(--m3-on-surface)">
        {guardQuestion(change)}
      </p>
      <p id="rebuild-confirm-detail" className="mt-0.5 text-[11px] leading-snug text-(--m3-on-surface)/85">
        {guardConsequence(guard)}
      </p>
      <div className="mt-2 flex justify-end gap-1.5">
        <M3Button data-keep size="sm" variant="text" onClick={onCancel} className="text-(--m3-on-surface)">
          Keep the clip
        </M3Button>
        <M3Button size="sm" variant="filled" onClick={onConfirm}>
          Rebuild
        </M3Button>
      </div>
    </div>
  );
}

/** In the stage's status line, when Exercise mode is picked on a locked clip: allow rebuilds for this clip, or stay in Limb. */
export function StageGuardConfirm({ guard, onAllow, onCancel }: { guard: Locked; onAllow: () => void; onCancel: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.querySelector<HTMLButtonElement>("[data-keep]")?.focus(), []);
  return (
    <div
      ref={box}
      role="alertdialog"
      aria-label="Allow Exercise drags on this saved clip?"
      aria-describedby="stage-guard-detail"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      data-stage-guard
    >
      <Lock className="h-3.5 w-3.5 shrink-0 text-(--m3-warning)" aria-hidden="true" />
      <span id="stage-guard-detail" className="min-w-0 py-0.5 leading-snug text-pretty">
        {guardDragQuestion(guard)}
      </span>
      <span className="flex shrink-0 gap-1">
        <button type="button" data-keep onClick={onCancel} className="studio-state inline-flex h-7 cursor-pointer items-center rounded-full px-2.5 font-medium text-(--m3-on-surface) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/80">
          Stay in Limb
        </button>
        <button type="button" onClick={onAllow} className="studio-state inline-flex h-7 cursor-pointer items-center rounded-full bg-(--m3-primary) px-2.5 font-medium text-(--m3-on-primary) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/80 focus-visible:ring-offset-1">
          Allow rebuilds
        </button>
      </span>
    </div>
  );
}
