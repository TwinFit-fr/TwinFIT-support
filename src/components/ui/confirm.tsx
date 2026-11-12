"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** "light" is the Support look; "studio" is the dark 3D Studio look (see StudioConfirmSurface). */
export type ConfirmTheme = "light" | "studio";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

/** A confirmation in a native modal dialog. Mount it to show it; unmount it to close. */
export function ConfirmSurface({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  return (
    <Modal onClose={onCancel} labelledBy={titleId} dismissible={!loading} className="max-w-md">
      <div className="p-6">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {description && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600">{description}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "danger" : "default"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

type SurfaceProps = ConfirmOptions & { loading?: boolean; onConfirm: () => void; onCancel: () => void };

const studioButton =
  "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-full px-5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * The confirmation in the Studio's dark dialog look (its tokens come from .studio-root on the
 * dialog, which is outside the Studio's own tree). Opened last, so it stacks over the dialog that
 * asked; focus starts on Cancel, so a stray Enter discards nothing, and goes back on close.
 */
export function StudioConfirmSurface({ title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "default", loading = false, onConfirm, onCancel }: SurfaceProps) {
  const titleId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  const danger = variant === "danger";
  return (
    <Modal
      onClose={onCancel}
      labelledBy={titleId}
      dismissible={!loading}
      restoreFocus
      className="studio-root w-[440px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-(--studio-radius-lg) border border-(--m3-outline) bg-(--m3-surface-container) p-0 text-(--m3-on-surface) shadow-(--studio-float-shadow) backdrop:bg-(--m3-scrim)"
    >
      <div data-studio-confirm="plain" className="flex items-start gap-3 px-5 pb-4 pt-5">
        <span
          aria-hidden
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-(--studio-radius-md)",
            danger ? "bg-(--m3-error-container) text-(--m3-error)" : "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)",
          )}
        >
          {danger ? <AlertTriangle className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold leading-snug tracking-tight">
            {title}
          </h2>
          {description ? <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-(--m3-on-surface-variant)">{description}</p> : null}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-(--m3-outline-variant) px-5 py-3.5">
        <button ref={cancel} type="button" data-confirm-cancel onClick={onCancel} disabled={loading} className={cn(studioButton, "text-(--m3-primary) hover:bg-(--m3-primary)/10")}>
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={cn(studioButton, danger ? "bg-(--m3-error) text-(--m3-error-container) hover:brightness-110" : "bg-(--m3-primary) text-(--m3-on-primary) hover:brightness-110")}
        >
          {loading ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Provides `useConfirm`: one confirmation at a time; a newer one cancels the pending one. */
export function ConfirmProvider({ children, theme = "light" }: { children: React.ReactNode; theme?: ConfirmTheme }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => {
    pending.current?.(false);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setOptions(next);
    });
  }, []);

  const settle = (ok: boolean) => {
    pending.current?.(ok);
    pending.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && theme === "studio" ? (
        <StudioConfirmSurface {...options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
      ) : null}
      {options && theme !== "studio" && (
        <ConfirmSurface
          {...options}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/** `await confirm({ title, … })` resolves true when the user confirms. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used within a ConfirmProvider");
  return confirm;
}
