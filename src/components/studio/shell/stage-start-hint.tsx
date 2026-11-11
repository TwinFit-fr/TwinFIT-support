"use client";

import { ArrowLeft, Search } from "lucide-react";
import { useStudioStore } from "@/lib/studio/store";
import { focusCatalogSearch } from "./catalog-focus";

/**
 * With nothing open, the first step on the stage itself: pick an exercise in the catalog (the
 * button opens the catalog if it is closed and puts the focus in its search). The workspace
 * shows it only once the catalog and an avatar are in, so it never points at a list that failed.
 */
export function StageStartHint() {
  const show = useStudioStore((s) => s.exerciseId === null && !s.poseEdit);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-x-(--studio-stage-inset) bottom-(--studio-stage-toolbar-reserve) flex justify-center">
      <div className="studio-glass pointer-events-auto flex min-w-0 max-w-full items-center gap-2.5 rounded-2xl p-2 shadow-2xl">
        <span aria-hidden className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-(--m3-primary-container) text-(--m3-on-primary-container) @lg/stage:flex">
          <ArrowLeft className="h-4 w-4" />
        </span>
        <span className="min-w-0 truncate pl-1 text-(length:--studio-text-sm) font-medium text-(--m3-on-surface) @lg/stage:pl-0">
          <span className="hidden @3xl/stage:inline">Start by picking an exercise in the catalog</span>
          <span className="@3xl/stage:hidden">Pick an exercise to start</span>
        </span>
        <button
          type="button"
          onClick={focusCatalogSearch}
          aria-keyshortcuts="/"
          className="studio-state inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-(--m3-primary) pl-3 pr-2 text-xs font-medium text-(--m3-on-primary) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-on-surface)/80"
        >
          <Search aria-hidden className="h-3.5 w-3.5" />
          Search
          <kbd aria-hidden className="rounded border border-(--m3-on-primary)/40 px-1.5 font-mono text-[11px] leading-4">
            /
          </kbd>
        </button>
      </div>
    </div>
  );
}
