"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

/**
 * A confirmation shown as a native modal <dialog>: the browser provides the top layer, focus
 * trap, Escape and inert page. Mount it to show it; unmount it to close.
 */
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
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: the owner decides, so the dialog only closes by unmounting.
        event.preventDefault();
        if (!loading) onCancel();
      }}
      // Keys typed in a modal belong to it: page shortcuts and panel Escape handlers stay quiet.
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        // The content fills the dialog box, so a click on the dialog itself is on the backdrop.
        if (event.target === event.currentTarget && !loading) onCancel();
      }}
      className="m-auto w-full max-w-md rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-lg backdrop:bg-black/40"
    >
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
    </dialog>
  );
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Provides `useConfirm`: one confirmation at a time; a newer one cancels the pending one. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
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
      {options && (
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
