"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useUserData } from "@nhost/react";
import { ArrowLeft, Box, PanelLeft, PanelRight } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useLayoutStore } from "@/lib/studio/layout-store";
import { LAYOUT_TOKENS, clamp, fitSidePanes, floatingSize, maxSizeNow, scaledSize } from "@/lib/studio/workspace-layout";
import { PaneSplitter } from "./pane-splitter";
import { SidePane } from "./side-pane";
import { ToolButton, ToolDivider } from "./tool-button";
import { useElementSize } from "./use-element-size";

const LEFT_ID = "studio-pane-left";
const RIGHT_ID = "studio-pane-right";
const DOCK_ID = "studio-pane-dock";

/**
 * The Studio window: one slim top bar, the catalog on the left, the stage in the centre with the
 * most room, the properties on the right and an optional dock under the stage (the timeline).
 * Panes are resized by their inner edge, collapse without unmounting and are remembered per
 * browser. Below LAYOUT_TOKENS.overlayBelow the side panes float over the stage instead.
 * The slots are elements built by the caller, so a resize re-renders this shell only.
 */
export function StudioShell({
  title,
  tools,
  left,
  center,
  right,
  dock,
  leftLabel = "Catalog",
  rightLabel = "Inspector",
  rightTitle,
  dockLabel = "Timeline",
}: {
  /** Centre of the top bar: what is being worked on. */
  title?: React.ReactNode;
  /** Right of the top bar: the compact tool group. */
  tools?: React.ReactNode;
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  /** Under the stage; nothing (and no space) when absent. */
  dock?: React.ReactNode;
  leftLabel?: string;
  rightLabel?: string;
  /** Heading shown at the top of the right pane (defaults to its label), e.g. the editor in use. */
  rightTitle?: string;
  dockLabel?: string;
}) {
  const user = useUserData();
  const layout = useLayoutStore();
  const narrow = useMediaQuery(`(max-width: ${LAYOUT_TOKENS.overlayBelow - 1}px)`);
  const body = useRef<HTMLDivElement>(null);
  const stageColumn = useRef<HTMLDivElement>(null);
  const measured = useElementSize(body);
  const column = useElementSize(stageColumn);
  const bodyWidth = measured.width || (typeof window === "undefined" ? 1440 : window.innerWidth);

  const { panes } = LAYOUT_TOKENS;
  const floating = narrow;
  const leftOpen = floating ? layout.floating === "left" : !layout.left.collapsed;
  const rightOpen = floating ? layout.floating === "right" : !layout.right.collapsed;
  // A layout arranged in a wider window is scaled down to this one, so the stage keeps its room.
  const fit = fitSidePanes(bodyWidth, layout.left, layout.right, layout.at);
  const leftWidth = floating ? floatingSize("left", layout.left.size, bodyWidth) : fit.left || scaledSize("left", layout.left.size, layout.at, bodyWidth);
  const rightWidth = floating ? floatingSize("right", layout.right.size, bodyWidth) : fit.right || scaledSize("right", layout.right.size, layout.at, bodyWidth);
  const leftMax = maxSizeNow("left", bodyWidth, floating ? 0 : fit.right, floating);
  const rightMax = maxSizeNow("right", bodyWidth, floating ? 0 : fit.left, floating);
  const dockOpen = Boolean(dock) && !layout.dock.collapsed;
  const dockMax = maxSizeNow("dock", column.height || 600, 0, false);
  const dockHeight = clamp(layout.dock.size, panes.dock.min, dockMax);

  const leftToggle = useRef<HTMLButtonElement>(null);
  const rightToggle = useRef<HTMLButtonElement>(null);
  const toggle = (pane: "left" | "right") => {
    const wasOpen = pane === "left" ? leftOpen : rightOpen;
    // Focus inside a pane that closes would be lost: it moves to the pane's toggle in the top bar.
    if (wasOpen && document.activeElement?.closest(`#${pane === "left" ? LEFT_ID : RIGHT_ID}`)) (pane === "left" ? leftToggle : rightToggle).current?.focus();
    if (floating) layout.setFloating(layout.floating === pane ? null : pane);
    else layout.togglePane(pane);
  };
  useShortcuts({ "[": () => toggle("left"), "]": () => toggle("right") });

  // A floating pane closes with Escape (unless a dialog or a menu takes the key).
  const floatingPane = floating ? layout.floating : null;
  const setFloating = layout.setFloating;
  useEffect(() => {
    if (!floatingPane) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest("dialog,[role=menu]")) return;
      setFloating(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [floatingPane, setFloating]);

  return (
    <div className="studio-shell flex h-full min-w-0 flex-col" data-resizing={layout.resizing ?? undefined}>
      <header className="relative z-40 flex h-(--studio-topbar-h) shrink-0 items-center gap-(--studio-space-2) border-b border-(--m3-outline-variant) bg-(--m3-surface-container-lowest) px-(--studio-space-2)">
        <div className="flex shrink-0 items-center gap-(--studio-space-1)">
          <Link
            href="/"
            aria-label="Back to Support"
            data-tip="Back to Support"
            data-tip-align="start"
            className="studio-state studio-tip flex h-(--studio-control-md) w-(--studio-control-md) items-center justify-center rounded-(--studio-radius-md) text-(--m3-on-surface-variant) outline-none hover:text-(--m3-on-surface) focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div data-studio-brand className="flex items-center gap-(--studio-space-2) pr-(--studio-space-1)">
            <span className="flex h-6 w-6 items-center justify-center rounded-(--studio-radius-sm) bg-(--m3-primary-container) text-(--m3-on-primary-container)">
              <Box className="h-3.5 w-3.5" />
            </span>
            <span className="hidden whitespace-nowrap text-(length:--studio-text-sm) font-semibold tracking-tight lg:inline">TwinFIT 3D Studio</span>
          </div>
          <ToolDivider />
          <ToolButton
            ref={leftToggle}
            label={`${leftOpen ? "Hide" : "Show"} the ${leftLabel.toLowerCase()} ( [ )`}
            active={leftOpen}
            onClick={() => toggle("left")}
            aria-controls={LEFT_ID}
            aria-keyshortcuts="["
            tipAlign="start"
          >
            <PanelLeft className="h-4 w-4" />
          </ToolButton>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center">{title}</div>

        <div className="flex shrink-0 items-center gap-(--studio-space-1)">
          {tools}
          <ToolDivider />
          {user?.email ? (
            <span data-studio-user className="hidden max-w-44 truncate px-(--studio-space-1) text-(length:--studio-text-xs) text-(--m3-on-surface-variant) min-[1600px]:block" title={user.email}>
              {user.email}
            </span>
          ) : null}
          <ToolButton
            ref={rightToggle}
            label={`${rightOpen ? "Hide" : "Show"} the ${rightLabel.toLowerCase()} ( ] )`}
            active={rightOpen}
            onClick={() => toggle("right")}
            aria-controls={RIGHT_ID}
            aria-keyshortcuts="]"
            tipAlign="end"
          >
            <PanelRight className="h-4 w-4" />
          </ToolButton>
        </div>
      </header>

      <div ref={body} className="relative flex min-h-0 min-w-0 flex-1">
        <SidePane id={LEFT_ID} side="left" label={leftLabel} open={leftOpen} width={leftWidth} contentWidth={leftWidth} floating={floating} onClose={() => toggle("left")}>
          {left}
        </SidePane>
        {!floating || leftOpen ? (
          <PaneSplitter
            pane="left"
            label={`Resize the ${leftLabel.toLowerCase()}`}
            controls={LEFT_ID}
            grow="ArrowRight"
            size={leftWidth}
            max={leftMax}
            open={leftOpen}
            style={floating ? { position: "absolute", insetBlock: 0, left: leftWidth, zIndex: 35 } : undefined}
          />
        ) : null}

        <div ref={stageColumn} className="flex min-w-0 flex-1 flex-col">
          <main className="@container/stage relative isolate min-h-0 min-w-0 flex-1 bg-(--m3-surface-dim)">{center}</main>
          {/* The dock slot is always in the page; empty, it is hidden and takes no space. */}
          {dock ? (
            <PaneSplitter pane="dock" label={`Resize the ${dockLabel.toLowerCase()}`} controls={DOCK_ID} grow="ArrowUp" size={dockHeight} max={dockMax} open={dockOpen} />
          ) : null}
          <section
            id={DOCK_ID}
            aria-label={dockLabel}
            data-dock={dock ? (dockOpen ? "open" : "collapsed") : "empty"}
            data-open={dockOpen}
            hidden={!dock}
            inert={!dockOpen}
            style={{ height: dockOpen ? dockHeight : 0 }}
            className="studio-pane flex min-h-0 shrink-0 flex-col overflow-hidden border-t border-(--m3-outline-variant) bg-(--m3-surface-container-low) data-[open=false]:border-t-0"
          >
            {dock}
          </section>
        </div>

        {!floating || rightOpen ? (
          <PaneSplitter
            pane="right"
            label={`Resize the ${rightLabel.toLowerCase()}`}
            controls={RIGHT_ID}
            grow="ArrowLeft"
            size={rightWidth}
            max={rightMax}
            open={rightOpen}
            style={floating ? { position: "absolute", insetBlock: 0, right: rightWidth, zIndex: 35 } : undefined}
          />
        ) : null}
        <SidePane id={RIGHT_ID} side="right" label={rightLabel} title={rightTitle} open={rightOpen} width={rightWidth} contentWidth={rightWidth} floating={floating} onClose={() => toggle("right")}>
          {right}
        </SidePane>

        {floating && (leftOpen || rightOpen) ? (
          <div aria-hidden className="absolute inset-0 z-20 bg-(--m3-scrim)" onClick={() => layout.setFloating(null)} />
        ) : null}
      </div>
    </div>
  );
}
