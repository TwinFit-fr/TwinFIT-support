"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTopDialog } from "./use-top-dialog";

type ToastType = "success" | "error" | "info";

/** A button on the toast, such as Undo; clicking it also dismisses the toast. */
export type ToastAction = { label: string; onClick: () => void };

export type Toast = {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: ToastAction;
};

/** Toasts with an action stay longer, so there is time to use it. */
const ACTION_DURATION = 8000;

/**
 * "light" is the Support look. "studio" is the dark 3D Studio look: toasts are drawn inside the
 * topmost open modal dialog (everything outside a modal is inert and under it), and errors stay
 * twice as long, since they are the reason something did not happen.
 */
export type ToastTheme = "light" | "studio";

type ToastContextType = {
  toasts: Toast[];
  showToast: (
    message: string,
    type?: ToastType,
    title?: string,
    duration?: number,
    action?: ToastAction,
  ) => void;
  success: (message: string, title?: string, action?: ToastAction) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children, theme = "light" }: { children: React.ReactNode; theme?: ToastTheme }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      type: ToastType = "info",
      title?: string,
      duration = 4000,
      action?: ToastAction,
    ) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: Toast = { id, message, type, title, duration, action };
      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  const success = useCallback(
    (message: string, title?: string, action?: ToastAction) =>
      showToast(message, "success", title, action ? ACTION_DURATION : undefined, action),
    [showToast],
  );

  const error = useCallback(
    (message: string, title?: string) => showToast(message, "error", title, theme === "studio" ? ACTION_DURATION : undefined),
    [showToast, theme],
  );

  const info = useCallback(
    (message: string, title?: string) => showToast(message, "info", title),
    [showToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, success, error, info, removeToast }}>
      {children}
      <ToastRegion toasts={toasts} theme={theme} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

type RegionProps = { toasts: Toast[]; theme: ToastTheme; onRemove: (id: string) => void };

function ToastRegion({ toasts, theme, onRemove }: RegionProps) {
  if (theme === "studio") return <StudioToastRegion toasts={toasts} onRemove={onRemove} />;
  return (
    <div
      role="status"
      aria-live="polite"
      data-toast-region
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg transition-all duration-200 animate-in fade-in slide-in-from-bottom-5",
            toast.type === "success" && "border-emerald-200 bg-white text-zinc-900",
            toast.type === "error" && "border-red-200 bg-white text-zinc-900",
            toast.type === "info" && "border-zinc-200 bg-white text-zinc-900",
          )}
        >
          {toast.type === "success" && (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          )}
          {toast.type === "error" && (
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          )}
          {toast.type === "info" && (
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            {toast.title && (
              <p className="text-sm font-semibold text-zinc-900">{toast.title}</p>
            )}
            <p className="text-sm text-zinc-600">{toast.message}</p>
          </div>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                onRemove(toast.id);
                toast.action?.onClick();
              }}
              className="shrink-0 rounded-md px-2 py-0.5 text-sm font-medium text-zinc-900 underline-offset-2 hover:bg-zinc-100 hover:underline"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(toast.id)}
            aria-label="Dismiss"
            className="text-zinc-400 hover:text-zinc-600 transition-colors p-0.5 rounded-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

const STUDIO_ICON = { success: CheckCircle2, error: AlertCircle, info: Info } as const;

/** The Studio's dark toasts, over whatever dialog is open (portalled into it), bottom right. */
function StudioToastRegion({ toasts, onRemove }: Omit<RegionProps, "theme">) {
  const dialog = useTopDialog(true);
  const region = (
    <div
      role="status"
      aria-live="polite"
      data-toast-region="studio"
      className="studio-root pointer-events-none fixed bottom-4 right-4 z-50 m-0 flex w-full max-w-sm flex-col gap-2 bg-transparent px-4 sm:px-0"
    >
      {toasts.map((toast) => {
        const Icon = STUDIO_ICON[toast.type];
        return (
          <div
            key={toast.id}
            data-toast={toast.type}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-(--studio-radius-lg) border bg-(--m3-surface-container-high) p-3.5 text-(--m3-on-surface) shadow-(--studio-float-shadow) motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-5",
              toast.type === "error" ? "border-(--m3-error)/50" : toast.type === "success" ? "border-(--m3-success)/35" : "border-(--m3-outline)",
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                "mt-0.5 h-4.5 w-4.5 shrink-0",
                toast.type === "error" ? "text-(--m3-error)" : toast.type === "success" ? "text-(--m3-success)" : "text-(--m3-primary)",
              )}
            />
            <div className="min-w-0 flex-1 text-[13px] leading-snug">
              {toast.title ? <p className="font-semibold">{toast.title}</p> : null}
              <p className={cn("break-words text-(--m3-on-surface-variant)", toast.title && "mt-0.5")}>{toast.message}</p>
            </div>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  onRemove(toast.id);
                  toast.action?.onClick();
                }}
                className="shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[13px] font-medium text-(--m3-primary) outline-none hover:bg-(--m3-primary)/10 focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onRemove(toast.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--m3-on-surface-variant) outline-none hover:bg-(--m3-on-surface)/10 hover:text-(--m3-on-surface) focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
  return dialog ? createPortal(region, dialog) : region;
}
