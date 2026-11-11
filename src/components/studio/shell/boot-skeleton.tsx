import { ArrowLeft, Box, PanelLeft, PanelLeftClose, PanelRight, PanelRightClose } from "lucide-react";
import { CatalogSkeletonRows, SkeletonBar, StudioLoader } from "../load-states";

const ICON = "flex h-(--studio-control-md) w-(--studio-control-md) shrink-0 items-center justify-center rounded-(--studio-radius-md) text-(--m3-on-surface-variant)";
const PANE_HEADER = "flex h-(--studio-pane-header-h) shrink-0 items-center gap-(--studio-space-2) border-b border-(--m3-outline-variant)";
const PANE_TITLE = "min-w-0 flex-1 truncate text-(length:--studio-text-xs) font-semibold uppercase tracking-[0.14em] text-(--m3-on-surface-variant)";

/**
 * The Studio window before the workspace can mount (the staff session is being checked): the
 * same dark frame, top bar and panes as the shell, with quiet skeletons and one small loader.
 * Static (no store, no session), so the server renders it and the page is never white. Pane
 * widths follow the shell's first-time sizes (LAYOUT_TOKENS: 18 % / 22 % of the window, within
 * their limits); below 1024 px the panes float closed, as in the shell.
 */
export function StudioBootSkeleton({ label = "Checking your staff session…" }: { label?: string }) {
  return (
    <div className="studio-root flex h-dvh w-screen flex-col overflow-hidden antialiased" aria-busy="true">
      <header className="flex h-(--studio-topbar-h) shrink-0 items-center gap-(--studio-space-2) border-b border-(--m3-outline-variant) bg-(--m3-surface-container-lowest) px-(--studio-space-2)">
        <div aria-hidden className="flex shrink-0 items-center gap-(--studio-space-1)">
          <span className={ICON}>
            <ArrowLeft className="h-4 w-4" />
          </span>
          <span data-studio-brand className="flex items-center gap-(--studio-space-2) pr-(--studio-space-1)">
            <span className="flex h-6 w-6 items-center justify-center rounded-(--studio-radius-sm) bg-(--m3-primary-container) text-(--m3-on-primary-container)">
              <Box className="h-3.5 w-3.5" />
            </span>
            <span className="hidden whitespace-nowrap text-(length:--studio-text-sm) font-semibold tracking-tight lg:inline">TwinFIT 3D Studio</span>
          </span>
          <span className="mx-(--studio-space-1) h-5 w-px bg-(--m3-outline-variant)" />
          <span className={ICON}>
            <PanelLeft className="h-4 w-4" />
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <SkeletonBar className="h-2.5 w-40" />
        </div>
        <div aria-hidden className="flex shrink-0 items-center gap-(--studio-space-2)">
          <span className="h-(--studio-control-md) w-(--studio-avatar-select-w) rounded-(--studio-radius-md) border border-(--m3-outline-variant) bg-(--m3-surface-container-high)" />
          <SkeletonBar className="hidden h-2.5 w-16 md:block" />
          <span className="mx-(--studio-space-1) h-5 w-px bg-(--m3-outline-variant)" />
          <span className={ICON}>
            <PanelRight className="h-4 w-4" />
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside aria-hidden className="@container/pane hidden w-[clamp(240px,18vw,300px)] shrink-0 flex-col border-r border-(--m3-outline-variant) bg-(--m3-surface-container-low) lg:flex">
          <div className={`${PANE_HEADER} pl-(--studio-space-3) pr-(--studio-space-1)`}>
            <span className={PANE_TITLE}>Catalog</span>
            <span className="flex h-(--studio-control-sm) w-(--studio-control-sm) items-center justify-center text-(--m3-on-surface-variant)">
              <PanelLeftClose className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="space-y-3 px-3 pt-3">
            <span className="block h-10 rounded-full bg-(--m3-surface-container-high)" />
            <SkeletonBar className="h-2.5 w-1/2" />
            <div className="flex gap-1.5">
              <SkeletonBar className="h-7 w-12 rounded-lg" />
              <SkeletonBar className="h-7 w-16 rounded-lg" />
              <SkeletonBar className="h-7 w-14 rounded-lg" />
            </div>
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-hidden">
            <CatalogSkeletonRows rows={14} />
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 bg-(--m3-surface-dim)">
          <StudioLoader label={label} />
        </main>

        <aside aria-hidden className="hidden w-[clamp(320px,22vw,420px)] shrink-0 flex-col border-l border-(--m3-outline-variant) bg-(--m3-surface-container-low) lg:flex">
          <div className={`${PANE_HEADER} flex-row-reverse pl-(--studio-space-1) pr-(--studio-space-3)`}>
            <span className={PANE_TITLE}>Animation</span>
            <span className="flex h-(--studio-control-sm) w-(--studio-control-sm) items-center justify-center text-(--m3-on-surface-variant)">
              <PanelRightClose className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="space-y-3 px-4 py-5">
            <SkeletonBar className="h-3 w-3/5" />
            <SkeletonBar className="h-2 w-4/5" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 pt-2">
                <span className="h-8 w-8 shrink-0 rounded-(--studio-radius-md) bg-(--m3-surface-container-high)" />
                <span className="flex flex-1 flex-col gap-2">
                  <SkeletonBar className="h-2.5 w-2/5" />
                  <SkeletonBar className="h-2 w-4/5" />
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
