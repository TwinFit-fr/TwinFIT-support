"use client";

import { useEffect, type RefObject } from "react";

/**
 * A popover that closes on Escape (the focus going back to its toggle) or on a press outside
 * `root`. Used by the stage's help cards (the point legend, the rig editor's legend).
 */
export function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLElement | null>, toggle: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      toggle.current?.focus();
    };
    const onDown = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, close, root, toggle]);
}
