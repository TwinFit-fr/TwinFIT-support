"use client";

import { useLayoutStore } from "@/lib/studio/layout-store";
import { LAYOUT_TOKENS } from "@/lib/studio/workspace-layout";

export const CATALOG_SEARCH_ID = "studio-catalog-search";

/**
 * The first step from anywhere (the stage hint, the guide): opens the catalog if it is closed
 * (floating on a narrow window) and puts the focus in its search, ready to type.
 */
export function focusCatalogSearch(): void {
  const layout = useLayoutStore.getState();
  const narrow = window.matchMedia(`(max-width: ${LAYOUT_TOKENS.overlayBelow - 1}px)`).matches;
  if (narrow) {
    if (layout.floating !== "left") layout.setFloating("left");
  } else if (layout.left.collapsed) {
    layout.togglePane("left");
  }
  // The pane stops being inert on the next render: wait a few frames for it.
  let tries = 0;
  const attempt = () => {
    const input = document.getElementById(CATALOG_SEARCH_ID) as HTMLInputElement | null;
    if (input && !input.closest("[inert]")) {
      input.focus();
      input.select();
    } else if (tries++ < 10) {
      requestAnimationFrame(attempt);
    }
  };
  requestAnimationFrame(attempt);
}
