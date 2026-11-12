"use client";

import { useEffect, useState } from "react";

/**
 * The topmost open modal <dialog>, or null. A modal dialog makes everything outside it inert, so
 * content that must stay visible and usable above it (toasts) is portalled into it. Follows
 * dialogs as they open, close and stack (a confirmation over a form dialog), in the order they
 * opened, which is the order the browser stacks them in, whatever their place in the document.
 */
export function useTopDialog(enabled: boolean): HTMLDialogElement | null {
  const [top, setTop] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let stack: HTMLDialogElement[] = [];
    const find = () => {
      const open = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].filter((d) => d.matches(":modal"));
      stack = [...stack.filter((d) => open.includes(d)), ...open.filter((d) => !stack.includes(d))];
      setTop(stack.at(-1) ?? null);
    };
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, [enabled]);
  return enabled ? top : null;
}
