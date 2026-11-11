"use client";

import { useState } from "react";
import { GalleryHorizontal } from "lucide-react";

export const DOCK_PREVIEW_KEY = "twinfit.studio.dockPreview";

function readFlag(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (new URLSearchParams(window.location.search).get("dock") === "preview") return true;
  try {
    return window.localStorage.getItem(DOCK_PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Development only: `/studio?dock=preview`, or localStorage `twinfit.studio.dockPreview` = "1",
 * fills the bottom dock with a stand-in when the Studio opens, so the dock slot (splitter, height
 * limits, remembered size) can be tried before the timeline exists. Always false in production.
 */
export function useDockPreview(): boolean {
  // Read once when the Studio opens (the Studio renders on the client only, behind the staff guard).
  const [on] = useState(() => typeof window !== "undefined" && readFlag());
  return on;
}

/** Stand-in content for the dock while the timeline is not built yet. */
export function DockPreview() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-(--studio-pane-header-h) shrink-0 items-center gap-(--studio-space-2) border-b border-(--m3-outline-variant) px-(--studio-space-3)">
        <h2 className="text-(length:--studio-text-xs) font-semibold uppercase tracking-[0.14em] text-(--m3-on-surface-variant)">Timeline</h2>
        <span className="text-(length:--studio-text-xs) text-(--m3-on-surface-variant)">dock preview</span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-(--studio-space-2) text-(length:--studio-text-sm) text-(--m3-on-surface-variant)">
        <GalleryHorizontal aria-hidden className="h-4 w-4" />
        The timeline goes here. Drag the top edge to resize this dock.
      </div>
    </div>
  );
}
