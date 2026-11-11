"use client";

import { create } from "zustand";
import { LAYOUT_STORAGE_KEY, arrangeIn, defaultLayout, initialSize, readLayoutJson, serializeLayout, type ArrangedLayout, type PaneId, type PaneState } from "./workspace-layout.ts";

/**
 * Pane sizes and collapsed state of the Studio workspace, remembered per browser. Kept apart from
 * the main studio store so a separator drag never notifies the canvas or the panels.
 */
export type LayoutState = ArrangedLayout & {
  /** Side pane floating over the stage on a narrow window (not remembered). */
  floating: "left" | "right" | null;
  /** A separator drag in progress: transitions are off while it lasts. */
  resizing: PaneId | null;
  /**
   * Nothing remembered and nothing touched yet: the side panes keep their first-time share of
   * the window as it is resized. The first resize, collapse or reset by the user ends it.
   */
  followWindow: boolean;
  /** The window was resized: first-time sizes follow it while `followWindow` holds. */
  fitWindow: (windowWidth: number) => void;
  setPane: (pane: PaneId, next: Partial<PaneState>) => void;
  togglePane: (pane: PaneId) => void;
  resetPane: (pane: PaneId) => void;
  setFloating: (pane: "left" | "right" | null) => void;
  setResizing: (pane: PaneId | null) => void;
};

const windowWidth = () => (typeof window === "undefined" ? undefined : window.innerWidth);

function readStored(): { layout: ArrangedLayout; stored: boolean } {
  if (typeof window === "undefined") return { layout: { ...defaultLayout(), at: null }, stored: false };
  try {
    const json = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    return { layout: readLayoutJson(json, windowWidth()), stored: json !== null };
  } catch {
    return { layout: { ...defaultLayout(windowWidth()), at: null }, stored: false };
  }
}

/**
 * The layout a size change starts from: the one on screen, taken as arranged in this window.
 * (In a window smaller than the one it was arranged in, the panes show scaled down: the change
 * applies to what is seen, and both panes are remembered for this window from then on.)
 */
function arrangedHere(s: ArrangedLayout): ArrangedLayout {
  const width = windowWidth();
  return width ? arrangeIn({ left: s.left, right: s.right, dock: s.dock, at: s.at }, width) : { left: s.left, right: s.right, dock: s.dock, at: s.at };
}

const initial = readStored();

export const useLayoutStore = create<LayoutState>((set) => ({
  ...initial.layout,
  floating: null,
  resizing: null,
  followWindow: !initial.stored,
  setPane: (pane, next) =>
    set((s) => {
      // Collapsing, reopening or resizing the dock keeps the arrangement of the side panes; a new
      // width is for the window it is set in.
      const base = next.size === undefined || pane === "dock" ? s : arrangedHere(s);
      const panes = { left: base.left, right: base.right, dock: base.dock, [pane]: { ...base[pane], ...next } };
      const changed = (["left", "right", "dock"] as const).filter((id) => panes[id].size !== s[id].size || panes[id].collapsed !== s[id].collapsed);
      const at = base.at ?? windowWidth() ?? null;
      if (!changed.length && (at === s.at || s.at === null)) return s;
      return { ...Object.fromEntries(changed.map((id) => [id, panes[id]])), at, followWindow: false };
    }),
  togglePane: (pane) => set((s) => ({ [pane]: { ...s[pane], collapsed: !s[pane].collapsed }, at: s.at ?? windowWidth() ?? null, followWindow: false })),
  resetPane: (pane) =>
    set((s) => {
      const base = pane === "dock" ? s : arrangedHere(s);
      return { left: base.left, right: base.right, [pane]: { size: initialSize(pane, windowWidth()), collapsed: false }, at: base.at ?? windowWidth() ?? null, followWindow: false };
    }),
  fitWindow: (width) =>
    set((s) => {
      if (!s.followWindow) return s;
      const left = initialSize("left", width);
      const right = initialSize("right", width);
      if (left === s.left.size && right === s.right.size) return s;
      return { left: { ...s.left, size: left }, right: { ...s.right, size: right } };
    }),
  setFloating: (floating) => set((s) => (s.floating === floating ? s : { floating })),
  setResizing: (resizing) => set((s) => (s.resizing === resizing ? s : { resizing })),
}));

// Remember the layout a moment after it settles (a drag writes once, at its end). Sizes that only
// follow the window are not written: they are the defaults, worked out again on the next visit.
if (typeof window !== "undefined") {
  let frame = 0;
  window.addEventListener("resize", () => {
    if (!useLayoutStore.getState().followWindow) return;
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => useLayoutStore.getState().fitWindow(window.innerWidth));
  });
  let timer: number | undefined;
  useLayoutStore.subscribe((state, previous) => {
    if (state.followWindow) return;
    const dragEnded = previous.resizing !== null && state.resizing === null;
    if (!dragEnded && state.left === previous.left && state.right === previous.right && state.dock === previous.dock && state.at === previous.at) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const { left, right, dock, at, resizing, followWindow } = useLayoutStore.getState();
      if (resizing || followWindow) return;
      try {
        window.localStorage.setItem(LAYOUT_STORAGE_KEY, serializeLayout({ left, right, dock, at }));
      } catch {
        /* a preference only: private mode or a full quota keeps the defaults next time */
      }
    }, 150);
  });
}
