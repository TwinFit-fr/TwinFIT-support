"use client";

import { useRef } from "react";
import { useLayoutStore } from "@/lib/studio/layout-store";
import { LAYOUT_TOKENS, clamp, dragResult, initialSize, separatorKey, type PaneId } from "@/lib/studio/workspace-layout";

type Grow = "ArrowRight" | "ArrowLeft" | "ArrowUp";

/**
 * The separator on a pane's inner edge (WAI-ARIA window splitter): drag it, or focus it and use
 * the arrow keys (Shift for bigger steps), Home / End, Enter to collapse or reopen; double-click
 * resets the pane to its default size. Dragging far below the minimum collapses the pane.
 */
export function PaneSplitter({
  pane,
  label,
  controls,
  grow,
  size,
  max,
  open,
  style,
}: {
  pane: PaneId;
  /** Accessible name, e.g. "Resize the catalog". */
  label: string;
  /** id of the pane it resizes. */
  controls: string;
  /** The arrow key that makes the pane bigger: it also gives the drag axis and direction. */
  grow: Grow;
  /** Size the pane has on screen now (px). */
  size: number;
  /** Largest size allowed right now (the stage keeps its room). */
  max: number;
  open: boolean;
  style?: React.CSSProperties;
}) {
  const setPane = useLayoutStore((s) => s.setPane);
  const togglePane = useLayoutStore((s) => s.togglePane);
  const resetPane = useLayoutStore((s) => s.resetPane);
  const setResizing = useLayoutStore((s) => s.setResizing);
  const drag = useRef<{ start: number; startSize: number; pointer: number } | null>(null);
  const { min } = LAYOUT_TOKENS.panes[pane];
  const limits = { min, max };
  const vertical = grow !== "ArrowUp";
  const sign = grow === "ArrowRight" ? 1 : -1;
  const coord = (event: React.PointerEvent) => (vertical ? event.clientX : event.clientY);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.dataset.dragging = "";
    drag.current = { start: coord(event), startSize: open ? size : 0, pointer: event.pointerId };
    setResizing(pane);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    const raw = d.startSize + sign * (coord(event) - d.start);
    // Live: follow the pointer within the limits; far below the minimum, show the pane collapsing.
    if (raw < min - LAYOUT_TOKENS.collapseSnap) setPane(pane, { collapsed: true });
    else setPane(pane, { size: Math.round(clamp(raw, min, max)), collapsed: false });
  };
  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
    const raw = d.startSize + sign * (coord(event) - d.start);
    // A click without movement on a collapsed pane's edge leaves it as it was.
    if (Math.abs(raw - d.startSize) >= 2) setPane(pane, dragResult(raw, d.startSize || initialSize(pane, window.innerWidth), limits));
    setResizing(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const result = separatorKey(event.key, event.shiftKey, open ? size : min, limits, grow);
    if (!result) return;
    event.preventDefault();
    if (result.type === "toggle") togglePane(pane);
    else if (result.type === "reset") resetPane(pane);
    else {
      // Like a drag: the pane follows each key at once (no slide), and is remembered on key up.
      setResizing(pane);
      setPane(pane, { size: result.size, collapsed: false });
    }
  };
  const endKeyResize = () => {
    if (useLayoutStore.getState().resizing === pane && !drag.current) setResizing(null);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={open ? size : 0}
      aria-valuetext={open ? `${size} pixels` : "collapsed"}
      aria-keyshortcuts={vertical ? "ArrowLeft ArrowRight Home End Enter" : "ArrowUp ArrowDown Home End Enter"}
      className="studio-splitter"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={() => resetPane(pane)}
      onKeyDown={onKeyDown}
      onKeyUp={endKeyResize}
      onBlur={endKeyResize}
    />
  );
}
