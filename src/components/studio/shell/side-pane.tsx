"use client";

import { PanelLeftClose, PanelRightClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolButton } from "./tool-button";

/**
 * A side pane of the workspace. It is never unmounted: closing it slides it to zero width and
 * makes it inert (no focus, no pointer, hidden from assistive tech), so whatever its panels hold
 * (typed text, filters, an unsaved pose draft, the editor's undo and unload guard) survives.
 * The content keeps its own width while the pane slides, so it does not reflow on the way.
 */
export function SidePane({
  id,
  side,
  label,
  title = label,
  open,
  width,
  contentWidth,
  floating,
  onClose,
  children,
}: {
  id: string;
  side: "left" | "right";
  label: string;
  /** Heading at the top of the pane (defaults to the label). */
  title?: string;
  open: boolean;
  width: number;
  contentWidth: number;
  /** Over the stage (narrow window) instead of beside it. */
  floating: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside
      id={id}
      aria-label={label}
      data-open={open}
      inert={!open}
      style={{ width: open ? width : 0 }}
      className={cn(
        "studio-pane flex min-h-0 shrink-0 overflow-hidden bg-(--m3-surface-container-low)",
        side === "left" ? "justify-start" : "justify-end",
        open && (side === "left" ? "border-r border-(--m3-outline-variant)" : "border-l border-(--m3-outline-variant)"),
        floating && "absolute inset-y-0 z-30 shadow-(--studio-float-shadow)",
        floating && (side === "left" ? "left-0" : "right-0"),
      )}
    >
      {/* 1 px less than the pane: its inner border. */}
      {/* `@container/pane`: panel content adapts to the pane's width, not the window's. */}
      <div style={{ width: contentWidth - 1 }} className="@container/pane flex h-full min-h-0 shrink-0 flex-col">
        <div className={cn("flex h-(--studio-pane-header-h) shrink-0 items-center gap-(--studio-space-2) border-b border-(--m3-outline-variant) pl-(--studio-space-3) pr-(--studio-space-1)", side === "right" && "flex-row-reverse pl-(--studio-space-1) pr-(--studio-space-3)")}>
          <h2 className="min-w-0 flex-1 truncate text-(length:--studio-text-xs) font-semibold uppercase tracking-[0.14em] text-(--m3-on-surface-variant)">{title}</h2>
          <ToolButton label={`Hide the ${label.toLowerCase()} ( ${side === "left" ? "[" : "]"} )`} onClick={onClose} tipAlign={side === "left" ? "end" : "start"} className="h-(--studio-control-sm) min-w-(--studio-control-sm)">
            {side === "left" ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
          </ToolButton>
        </div>
        {children}
      </div>
    </aside>
  );
}
