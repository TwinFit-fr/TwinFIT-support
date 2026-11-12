"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A native modal <dialog>: the browser provides the top layer, focus trap, Escape and the inert
 * page behind it. Mount it to open it; it closes by unmounting, so Escape and backdrop clicks
 * only ask the owner through `onClose`. Keys typed inside stay inside: page shortcuts and panel
 * handlers listening on window do not see them.
 */
export function Modal({
  onClose,
  labelledBy,
  dismissible = true,
  restoreFocus = false,
  className,
  children,
}: {
  onClose: () => void;
  /** Id of the element that names the dialog (its title). */
  labelledBy: string;
  /** False while busy: Escape and backdrop clicks are ignored. */
  dismissible?: boolean;
  /** Give focus back to the control that had it (the one that opened the dialog) on close. */
  restoreFocus?: boolean;
  /** Panel size and layout; the dialog element is the panel. */
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // The control focused when the dialog mounts is the one that opened it (read once, before showModal moves focus).
  const [opener] = useState(() => (typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    if (!restoreFocus) return;
    // Unmounting does not run the dialog's own close steps, so focus is handed back here.
    return () => {
      if (opener?.isConnected) requestAnimationFrame(() => opener.focus({ preventScroll: true }));
    };
  }, [restoreFocus, opener]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        // A file input fires a bubbling `cancel` when its picker is dismissed: that is not the
        // dialog's own Escape, so it must not close (or ask to close) the dialog.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        // Content fills the panel, so a click on the dialog element itself is on the backdrop.
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-lg backdrop:bg-black/40",
        className,
      )}
    >
      {children}
    </dialog>
  );
}
