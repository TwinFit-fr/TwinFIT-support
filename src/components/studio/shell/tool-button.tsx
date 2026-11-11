"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type ToolButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  /** Accessible name, repeated in the tooltip. */
  label: string;
  /** A toggle (announced with aria-pressed); leave it out for a plain action. */
  active?: boolean;
  /** Where the tooltip sits under the button, so it stays inside the window near an edge. */
  tipAlign?: "center" | "start" | "end";
  /** Text next to the icon; `textClassName` decides from which width it shows. */
  text?: string;
  textClassName?: string;
};

/**
 * A compact top-bar tool: icon, optional text that can hide on narrow windows, a tooltip on
 * hover and focus. Square while icon-only, with the same height as the other controls.
 */
export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { label, active, tipAlign = "center", text, textClassName, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      data-tip={label}
      data-tip-align={tipAlign === "center" ? undefined : tipAlign}
      className={cn(
        "studio-state studio-tip inline-flex h-(--studio-control-md) min-w-(--studio-control-md) shrink-0 cursor-pointer items-center justify-center gap-(--studio-space-2) rounded-(--studio-radius-md) px-(--studio-space-2) text-(length:--studio-text-xs) font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70 disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)"
          : "text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)",
        className,
      )}
      {...props}
    >
      {children}
      {text ? <span className={cn("whitespace-nowrap", textClassName)}>{text}</span> : null}
    </button>
  );
});

/** A thin vertical rule between groups of tools. */
export function ToolDivider({ className }: { className?: string }) {
  return <span aria-hidden className={cn("mx-(--studio-space-1) h-5 w-px shrink-0 bg-(--m3-outline-variant)", className)} />;
}
