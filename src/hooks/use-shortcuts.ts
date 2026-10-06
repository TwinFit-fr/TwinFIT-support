"use client";

import { useEffect, useRef } from "react";

/** Handlers keyed by `KeyboardEvent.key`; letters match in either case. */
export type ShortcutHandlers = Partial<Record<string, () => void>>;

const FORM_CONTROL = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/** Keys typed into a form control, or chorded with a modifier, belong to the browser. */
function belongsToBrowser(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return true;
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  return event.target instanceof Element && event.target.closest(FORM_CONTROL) !== null;
}

/**
 * Single-key page shortcuts. They never fire while typing in a form control (inputs, textareas,
 * selects, editable content) or with Ctrl / Cmd / Alt held, so browser chords like Ctrl+R stay
 * intact. The latest handlers are always used without re-subscribing.
 */
export function useShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (belongsToBrowser(event)) return;
      const handler = latest.current[event.key] ?? latest.current[event.key.toLowerCase()];
      if (!handler) return;
      event.preventDefault();
      handler();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
