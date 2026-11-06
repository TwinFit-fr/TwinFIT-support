"use client";

import Link from "next/link";
import { useUserData } from "@nhost/react";
import { ArrowLeft, Box } from "lucide-react";

/**
 * Three-column desktop layout: 100 dvh, the panes scroll on their own, the page never does.
 * Left: catalog. Centre: the 3D workspace. Right: generator / inspector.
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
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center">{topbar}</div>
        <div className="flex items-center gap-3 text-[11px] text-(--m3-on-surface-variant)">
          <span className="max-w-[180px] truncate" title={user?.email}>
            {user?.email}
          </span>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[304px_minmax(0,1fr)_384px]">
        <aside className="flex min-h-0 flex-col border-r border-(--m3-outline-variant) bg-(--m3-surface-container-low)">
          {left}
        </aside>
        <main className="relative min-h-0 min-w-0 bg-(--m3-surface-dim)">{center}</main>
        <aside className="flex min-h-0 flex-col border-l border-(--m3-outline-variant) bg-(--m3-surface-container-low)">
          {right}
        </aside>
      </div>
    </div>
  );
}
