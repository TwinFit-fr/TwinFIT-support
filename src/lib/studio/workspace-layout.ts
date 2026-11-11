/**
 * Workspace layout of the Studio: the size limits of the panes around the stage, how they fit a
 * window, how a separator answers the keyboard, and the shape remembered in localStorage.
 * Pure functions only (no DOM, no React), so the shell stays thin and this stays testable.
 */

export type PaneId = "left" | "right" | "dock";

export type PaneLimits = {
  /** Size in px a pane opens at when the window width is not known (server render). */
  initial: number;
  min: number;
  max: number;
  /**
   * First-time size as a share of the window width, capped at `initialMax`: the stage keeps
   * most of the room on any screen, the way an animation tool's viewport does.
   */
  share?: number;
  initialMax?: number;
};

/**
 * Size tokens of the shell, in px. Side panes are widths, the dock a height. The CSS reads the
 * live sizes from variables the shell sets; the visual tokens (bar height, radii, spacing) live
 * in globals.css.
 */
export const LAYOUT_TOKENS = {
  panes: {
    left: { initial: 272, min: 240, max: 480, share: 0.18, initialMax: 300 },
    right: { initial: 360, min: 320, max: 640, share: 0.22, initialMax: 420 },
    dock: { initial: 220, min: 120, max: 480 },
  } satisfies Record<PaneId, PaneLimits>,
  /** The stage never gets narrower than this while side panes are docked. */
  stageMinWidth: 440,
  /**
   * Share of the window the stage is given back when a layout arranged in a larger window is
   * fitted to a smaller one (as far as the pane minimums allow).
   */
  fittedStageShare: 0.5,
  /** The stage never gets shorter than this while the dock is open. */
  stageMinHeight: 240,
  /** Below this window width the side panes float over the stage instead of squeezing it. */
  overlayBelow: 1024,
  /** Room left uncovered next to a floating pane, so the stage stays visible and clickable. */
  overlayGutter: 56,
  /** Arrow keys move a separator by this much; with Shift by `keyStepLarge`. */
  keyStep: 16,
  keyStepLarge: 64,
  /** Dragging a pane this far below its minimum collapses it on release. */
  collapseSnap: 96,
} as const;

export type PaneState = { size: number; collapsed: boolean };
export type WorkspaceLayout = Record<PaneId, PaneState>;
/**
 * A layout together with the window width it was arranged in (`at`; null while nobody has
 * arranged anything and the sizes are the defaults). The sizes are right for that window: a
 * smaller one gets them scaled down, see `fitSidePanes`.
 */
export type ArrangedLayout = WorkspaceLayout & { at: number | null };

export const LAYOUT_STORAGE_KEY = "twinfit.studio.layout";
const LAYOUT_VERSION = 1;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The size a pane opens at the first time and after a reset, for a window `windowWidth` px wide
 * (the fixed `initial` when the width is unknown).
 */
export function initialSize(pane: PaneId, windowWidth?: number): number {
  const limits: PaneLimits = LAYOUT_TOKENS.panes[pane];
  if (!windowWidth || !Number.isFinite(windowWidth) || !limits.share) return limits.initial;
  return Math.round(clamp(windowWidth * limits.share, limits.min, limits.initialMax ?? limits.max));
}

export function defaultLayout(windowWidth?: number): WorkspaceLayout {
  return {
    left: { size: initialSize("left", windowWidth), collapsed: false },
    right: { size: initialSize("right", windowWidth), collapsed: false },
    dock: { size: initialSize("dock", windowWidth), collapsed: false },
  };
}

function parsePane(raw: unknown, limits: PaneLimits, fallback: PaneState): PaneState {
  if (!raw || typeof raw !== "object") return fallback;
  const { size, collapsed } = raw as { size?: unknown; collapsed?: unknown };
  return {
    size: typeof size === "number" && Number.isFinite(size) ? Math.round(clamp(size, limits.min, limits.max)) : fallback.size,
    collapsed: typeof collapsed === "boolean" ? collapsed : fallback.collapsed,
  };
}

/**
 * The layout stored in localStorage, validated field by field: anything missing, of the wrong
 * type, out of range or from another version falls back to the default for that field only.
 */
export function parseStoredLayout(raw: unknown, windowWidth?: number): ArrangedLayout {
  const fallback = { ...defaultLayout(windowWidth), at: null };
  if (!raw || typeof raw !== "object" || (raw as { v?: unknown }).v !== LAYOUT_VERSION) return fallback;
  const source = raw as Partial<Record<PaneId | "at", unknown>>;
  const { panes } = LAYOUT_TOKENS;
  return {
    left: parsePane(source.left, panes.left, fallback.left),
    right: parsePane(source.right, panes.right, fallback.right),
    dock: parsePane(source.dock, panes.dock, fallback.dock),
    at: typeof source.at === "number" && Number.isFinite(source.at) && source.at > 0 ? Math.round(source.at) : null,
  };
}

/** Reads a JSON string (or null) from storage; never throws. Defaults fit `windowWidth`. */
export function readLayoutJson(json: string | null, windowWidth?: number): ArrangedLayout {
  const fallback = () => ({ ...defaultLayout(windowWidth), at: null });
  if (!json) return fallback();
  try {
    return parseStoredLayout(JSON.parse(json), windowWidth);
  } catch {
    return fallback();
  }
}

export function serializeLayout(layout: ArrangedLayout): string {
  return JSON.stringify({ v: LAYOUT_VERSION, at: layout.at, left: layout.left, right: layout.right, dock: layout.dock });
}

/**
 * Width a side pane asks for in a window `windowWidth` px wide when its size was arranged in one
 * `at` px wide: its own size there and in anything wider, the same share of a smaller window
 * (never below its minimum).
 */
export function scaledSize(pane: "left" | "right", size: number, at: number | null, windowWidth: number): number {
  const { min, max } = LAYOUT_TOKENS.panes[pane];
  const own = clamp(size, min, max);
  if (!at || windowWidth >= at) return own;
  return Math.max(min, Math.round((own * windowWidth) / at));
}

/**
 * Widths the docked side panes really get in a window `available` px wide, for a layout arranged
 * in a window `at` px wide. A collapsed pane is 0.
 *
 * In that window or a wider one each pane keeps its size and the stage takes the rest (at least
 * `stageMinWidth`). In a smaller window the panes shrink first: each asks for the same share it
 * had, and the stage keeps the width it had until it is `fittedStageShare` of the window, so a
 * layout arranged on a big screen never leaves the stage a sliver on a laptop. When the panes do
 * not fit they shrink in proportion to how far each is above its minimum, never below it.
 */
export function fitSidePanes(available: number, left: PaneState, right: PaneState, at: number | null = null): { left: number; right: number } {
  const { panes, stageMinWidth, fittedStageShare } = LAYOUT_TOKENS;
  const want = {
    left: left.collapsed ? 0 : scaledSize("left", left.size, at, available),
    right: right.collapsed ? 0 : scaledSize("right", right.size, at, available),
  };
  let stageMin: number = stageMinWidth;
  if (at && available < at) {
    const stageThere = at - (left.collapsed ? 0 : clamp(left.size, panes.left.min, panes.left.max)) - (right.collapsed ? 0 : clamp(right.size, panes.right.min, panes.right.max));
    stageMin = Math.max(stageMinWidth, Math.min(stageThere, Math.round(available * fittedStageShare)));
  }
  const room = Math.max(0, available - stageMin);
  const total = want.left + want.right;
  if (total <= room) return want;
  const floor = { left: left.collapsed ? 0 : panes.left.min, right: right.collapsed ? 0 : panes.right.min };
  const slack = { left: want.left - floor.left, right: want.right - floor.right };
  const slackTotal = slack.left + slack.right;
  const over = total - room;
  if (slackTotal <= 0 || over >= slackTotal) return floor;
  const leftWidth = Math.round(want.left - (over * slack.left) / slackTotal);
  return { left: leftWidth, right: room - leftWidth };
}

/**
 * The layout as it shows in a window `windowWidth` px wide, taken as arranged there: what a
 * resize in a window smaller than the one the layout came from starts from, so the pane under
 * the pointer and the one across the stage both keep the width they have on screen.
 */
export function arrangeIn(layout: ArrangedLayout, windowWidth: number): ArrangedLayout {
  if (!layout.at || windowWidth >= layout.at) return { ...layout, at: windowWidth };
  const fit = fitSidePanes(windowWidth, layout.left, layout.right, layout.at);
  return {
    left: { ...layout.left, size: fit.left || scaledSize("left", layout.left.size, layout.at, windowWidth) },
    right: { ...layout.right, size: fit.right || scaledSize("right", layout.right.size, layout.at, windowWidth) },
    dock: layout.dock,
    at: windowWidth,
  };
}

/**
 * The largest size a pane can be dragged to right now: its own maximum, and no more than the
 * room the stage (and the other pane) leaves. Floating panes leave a gutter of the stage visible.
 */
export function maxSizeNow(pane: PaneId, available: number, other: number, floating: boolean): number {
  const limits = LAYOUT_TOKENS.panes[pane];
  const room = floating
    ? available - LAYOUT_TOKENS.overlayGutter
    : available - other - (pane === "dock" ? LAYOUT_TOKENS.stageMinHeight : LAYOUT_TOKENS.stageMinWidth);
  return Math.max(limits.min, Math.min(limits.max, Math.floor(room)));
}

/** Size of a floating pane in a window `available` px wide. */
export function floatingSize(pane: PaneId, size: number, available: number): number {
  const limits = LAYOUT_TOKENS.panes[pane];
  return Math.max(Math.min(limits.min, available), Math.min(clamp(size, limits.min, limits.max), available - LAYOUT_TOKENS.overlayGutter));
}

export type SeparatorKeyResult = { type: "size"; size: number } | { type: "reset" } | { type: "toggle" } | null;

/**
 * What a key does on a pane's separator (WAI-ARIA window splitter). `grow` is the arrow key that
 * makes the pane bigger (ArrowRight for the left pane, ArrowLeft for the right pane, ArrowUp for
 * the dock). Home / End go to the minimum / maximum, Enter collapses or reopens.
 */
export function separatorKey(
  key: string,
  shift: boolean,
  size: number,
  limits: { min: number; max: number },
  grow: "ArrowRight" | "ArrowLeft" | "ArrowUp" | "ArrowDown",
): SeparatorKeyResult {
  const opposite = { ArrowRight: "ArrowLeft", ArrowLeft: "ArrowRight", ArrowUp: "ArrowDown", ArrowDown: "ArrowUp" }[grow];
  const step = shift ? LAYOUT_TOKENS.keyStepLarge : LAYOUT_TOKENS.keyStep;
  if (key === grow) return { type: "size", size: clamp(size + step, limits.min, limits.max) };
  if (key === opposite) return { type: "size", size: clamp(size - step, limits.min, limits.max) };
  if (key === "Home") return { type: "size", size: limits.min };
  if (key === "End") return { type: "size", size: limits.max };
  if (key === "Enter") return { type: "toggle" };
  return null;
}

/**
 * The outcome of a drag that ended at `size`: below the minimum by more than `collapseSnap` the
 * pane collapses (and keeps the size it had before the drag, to reopen at); otherwise the size
 * is clamped to the limits.
 */
export function dragResult(size: number, startSize: number, limits: { min: number; max: number }): PaneState {
  if (size < limits.min - LAYOUT_TOKENS.collapseSnap) return { size: startSize, collapsed: true };
  return { size: Math.round(clamp(size, limits.min, limits.max)), collapsed: false };
}
