"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { AlertCircle, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { IconButton, M3Button } from "./ui";

const WIDTH = { sm: "w-[520px]", md: "w-[760px]", lg: "w-[880px]" } as const;

/**
 * The one dark dialog of the Studio: a header (icon, title, one line of context, extras, close),
 * an optional toolbar, a scrolling body, the dialog's own alert line above the footer, and the
 * footer (a note on the left, Cancel and the actions on the right). It is a native modal, so it
 * traps focus and keys; it fits a 1024 x 768 window (the body scrolls, never the page); focus
 * starts on the element marked data-autofocus and goes back to the opener on close.
 *
 * Escape, the backdrop, the close button and Cancel all go through one close request: while
 * `busy` they do nothing, and while `dirty` they ask before the typed work is thrown away.
 */
export function StudioDialog({
  title,
  icon,
  subtitle,
  headerExtra,
  toolbar,
  size = "md",
  onClose,
  dirty = false,
  busy = false,
  error,
  onDismissError,
  footerNote,
  actions,
  cancelLabel = "Cancel",
  bodyClassName,
  children,
  ...data
}: {
  title: string;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right of the title, before the close button (a credits chip). */
  headerExtra?: React.ReactNode;
  /** A row between the header and the body that does not scroll (filters). */
  toolbar?: React.ReactNode;
  size?: keyof typeof WIDTH;
  onClose: () => void;
  /** The form holds typed work: closing asks first. */
  dirty?: boolean;
  /** Something is being sent: closing is refused until it is done. */
  busy?: boolean;
  /** Why the last action failed, shown in the dialog itself (role=alert). */
  error?: string | null;
  onDismissError?: () => void;
  footerNote?: React.ReactNode;
  /** The primary action(s), right of Cancel. */
  actions?: React.ReactNode;
  cancelLabel?: string;
  bodyClassName?: string;
  children: React.ReactNode;
} & { [key: `data-${string}`]: string | undefined }) {
  const titleId = useId();
  const confirm = useConfirm();
  const panel = useRef<HTMLDivElement>(null);
  const asking = useRef(false);

  const requestClose = useCallback(async () => {
    if (busy || asking.current) return;
    if (dirty) {
      asking.current = true;
      const discard = await confirm({
        title: "Discard what you typed?",
        description: "This dialog has changes that are not saved. Keep editing to save them, or discard them and close.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        variant: "danger",
      });
      asking.current = false;
      if (!discard) return;
    }
    onClose();
  }, [busy, dirty, confirm, onClose]);

  // showModal() focused the first control (the close button); the form's first field takes it instead.
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  return (
    <Modal
      onClose={() => void requestClose()}
      labelledBy={titleId}
      dismissible={!busy}
      restoreFocus
      className={cn(
        "studio-root max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-(--studio-radius-lg) border border-(--m3-outline) bg-(--m3-surface-container) p-0 text-(--m3-on-surface) shadow-(--studio-float-shadow) backdrop:bg-(--m3-scrim)",
        WIDTH[size],
      )}
    >
      <div ref={panel} className="flex max-h-[calc(100dvh-2rem)] flex-col" {...data}>
        <header className="flex shrink-0 items-center gap-3 border-b border-(--m3-outline-variant) py-3 pl-5 pr-3">
          {icon ? (
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--studio-radius-md) bg-(--m3-primary-container) text-(--m3-on-primary-container) [&>svg]:h-4 [&>svg]:w-4">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[15px] font-semibold leading-tight tracking-tight">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-[12px] leading-snug text-(--m3-on-surface-variant)">{subtitle}</p> : null}
          </div>
          {headerExtra}
          <IconButton label="Close" data-dialog-close onClick={() => void requestClose()} disabled={busy} className="h-8 w-8">
            <X aria-hidden className="h-4 w-4" />
          </IconButton>
        </header>
        {toolbar ? <div className="shrink-0 border-b border-(--m3-outline-variant) px-5 py-2.5">{toolbar}</div> : null}
        <div className={cn("studio-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>
        <div role="alert" data-dialog-error={error ? "" : undefined} className="shrink-0">
          {error ? (
            <div className="flex items-start gap-2.5 border-t border-(--m3-error)/40 bg-(--m3-error-container)/45 py-2.5 pl-5 pr-3">
              <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-(--m3-error)" />
              <p className="studio-scroll max-h-28 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-snug text-(--m3-on-surface)">{error}</p>
              {onDismissError ? (
                <IconButton label="Dismiss the error" onClick={onDismissError} className="-my-1 h-7 w-7">
                  <X aria-hidden className="h-3.5 w-3.5" />
                </IconButton>
              ) : null}
            </div>
          ) : null}
        </div>
        <footer className="flex shrink-0 items-center gap-3 border-t border-(--m3-outline-variant) px-5 py-3">
          <div className="min-w-0 flex-1 text-[12px] leading-snug text-(--m3-on-surface-variant)">{footerNote}</div>
          <M3Button variant="text" onClick={() => void requestClose()} disabled={busy} data-dialog-cancel>
            {cancelLabel}
          </M3Button>
          {actions}
        </footer>
      </div>
    </Modal>
  );
}
