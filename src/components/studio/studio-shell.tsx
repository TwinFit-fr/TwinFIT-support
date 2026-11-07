"use client";

import Link from "next/link";
import { useUserData } from "@nhost/react";
import { ArrowLeft, Box, PanelLeft, PanelRight } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { IconButton } from "./ui";

/** Below this the three panes no longer fit: the side panes are collapsible and a notice says so. */
const MIN_WIDTH_PX = 1100;

/**
 * Three-column desktop layout: 100 dvh, the panes scroll on their own, the page never does.
 * Left: catalog. Centre: the 3D workspace. Right: generator / inspector. Either side pane can
 * be collapsed (the centre takes its room).
 */
export function StudioShell({
  topbar,
  left,
  center,
  right,
}: {
  topbar?: React.ReactNode;
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}) {
  const user = useUserData();
  const panes = useStudioStore((s) => s.panes);
  const togglePane = useStudioStore((s) => s.togglePane);
  const narrow = useMediaQuery(`(max-width: ${MIN_WIDTH_PX - 1}px)`);
  return (
    <div className="grid h-full grid-rows-[52px_minmax(0,1fr)]">
      <header className="flex items-center justify-between gap-4 border-b border-(--m3-outline-variant) bg-(--m3-surface-container-lowest)/80 px-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            title="Back to Support"
            className="studio-state flex h-8 w-8 items-center justify-center rounded-full text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-(--m3-primary-container) text-(--m3-on-primary-container) shadow-[var(--studio-glow)]">
              <Box className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <div className="text-[13px] font-semibold tracking-tight">TwinFIT 3D Studio</div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">
                Movement generation
              </div>
            </div>
          </div>
          <IconButton label={panes.left ? "Hide the catalog" : "Show the catalog"} active={panes.left} onClick={() => togglePane("left")} className="h-8 w-8">
            <PanelLeft className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center">{topbar}</div>
        <div className="flex items-center gap-3 text-[11px] text-(--m3-on-surface-variant)">
          <span className="hidden max-w-[180px] truncate xl:block" title={user?.email}>
            {user?.email}
          </span>
          <IconButton label={panes.right ? "Hide the inspector" : "Show the inspector"} active={panes.right} onClick={() => togglePane("right")} className="h-8 w-8">
            <PanelRight className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <div
        className={cn(
          "grid min-h-0",
          panes.left && panes.right && "grid-cols-[304px_minmax(0,1fr)_384px]",
          panes.left && !panes.right && "grid-cols-[304px_minmax(0,1fr)]",
          !panes.left && panes.right && "grid-cols-[minmax(0,1fr)_384px]",
          !panes.left && !panes.right && "grid-cols-[minmax(0,1fr)]",
        )}
      >
        {panes.left ? (
          <aside className="flex min-h-0 flex-col border-r border-(--m3-outline-variant) bg-(--m3-surface-container-low)" aria-label="Catalog">
            {left}
          </aside>
        ) : null}
        <main className="relative min-h-0 min-w-0 bg-(--m3-surface-dim)">
          {narrow && panes.left && panes.right ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-2">
              <div className="studio-glass pointer-events-auto rounded-full px-3 py-1.5 text-[11px] text-(--m3-warning)">
                The Studio is made for screens of {MIN_WIDTH_PX}px or more: hide a side pane (top bar) to give the viewport room.
              </div>
            </div>
          ) : null}
          {center}
        </main>
        {panes.right ? (
          <aside className="flex min-h-0 flex-col border-l border-(--m3-outline-variant) bg-(--m3-surface-container-low)" aria-label="Inspector">
            {right}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
