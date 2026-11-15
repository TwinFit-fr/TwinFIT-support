"use client";

import { useEffect } from "react";

export const UNSAVED_MESSAGE = "You have unsaved changes. Leave and discard them?";

/**
 * Warns before the page is unloaded or an in-app link is followed while `dirty`. Next's router has
 * no navigation events, so link clicks are intercepted at the document in the capture phase.
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older Chromium needs returnValue set to show the prompt.
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      if (!window.confirm(UNSAVED_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}
