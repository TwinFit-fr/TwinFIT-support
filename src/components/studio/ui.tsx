"use client";

import { Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { VectorStatus } from "@/lib/studio/types";

/* Material 3 pieces for the dark Studio: filled / tonal / outlined / text buttons, filled text
   fields, chips, a segmented control and section cards. Colours come from the .studio-root tokens. */

type ButtonVariant = "filled" | "tonal" | "outlined" | "text";

export function M3Button({
  className,
  variant = "tonal",
  size = "md",
  busy = false,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={cn(
        "studio-state inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-[box-shadow,transform] outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/60 disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-5 text-sm",
        size === "lg" && "h-12 px-6 text-sm",
        variant === "filled" &&
          "bg-(--m3-primary) text-(--m3-on-primary) shadow-[var(--studio-glow)] active:translate-y-px",
        variant === "tonal" && "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)",
        variant === "outlined" &&
          "border border-(--m3-outline) bg-transparent text-(--m3-primary)",
        variant === "text" && "bg-transparent text-(--m3-primary)",
        className,
      )}
      {...props}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

/** `active` makes the button a toggle (announced with aria-pressed); leave it out for a plain action. */
export function IconButton({
  className,
  active,
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      className={cn(
        "studio-state inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-(--m3-primary)/60 disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)"
          : "text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * A caption over a control. A single input is wrapped in a <label>; `group` renders a labelled
 * group instead (for a segmented control or several inputs, where a label would activate the
 * first button when its caption is clicked).
 */
export function Field({
  label,
  hint,
  className,
  group = false,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  group?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  const caption = (
    <span id={group ? id : undefined} className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-(--m3-on-surface-variant)">
      {label}
    </span>
  );
  const hintNode = hint ? <span className="mt-1 block text-[11px] text-(--m3-on-surface-variant)/80">{hint}</span> : null;
  if (group) {
    return (
      <div role="group" aria-labelledby={id} className={cn("block", className)}>
        {caption}
        {children}
        {hintNode}
      </div>
    );
  }
  return (
    <label className={cn("block", className)}>
      {caption}
      {children}
      {hintNode}
    </label>
  );
}

const fieldBase =
  "w-full rounded-xl border border-(--m3-outline) bg-(--m3-surface-container-high) px-3.5 py-2.5 text-sm text-(--m3-on-surface) outline-none transition-colors placeholder:text-(--m3-on-surface-variant)/80 hover:bg-(--m3-surface-container-highest) focus:border-(--m3-primary) focus:bg-(--m3-surface-container-highest) disabled:opacity-50";

/**
 * A number input that is pleasant to type in: it shows the value rounded while idle, keeps what
 * you type while focused (decimals, a cleared field) and commits on blur or Enter; an empty or
 * unparsable field goes back to the last value instead of becoming 0.
 */
export function NumberField({
  value,
  onCommit,
  digits = 0,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number; onCommit: (value: number) => void; digits?: number }) {
  const [text, setText] = useState<string | null>(null);
  // A new value from outside drops what was being typed (state adjusted during render, no effect).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(null);
  }
  const shown = text ?? (Number.isFinite(value) ? value.toFixed(digits) : "");
  const commit = () => {
    if (text === null) return;
    const parsed = Number(text.replace(",", "."));
    setText(null);
    if (text.trim() !== "" && Number.isFinite(parsed) && parsed !== value) {
      const min = props.min !== undefined ? Number(props.min) : -Infinity;
      const max = props.max !== undefined ? Number(props.max) : Infinity;
      onCommit(Math.min(max, Math.max(min, parsed)));
    }
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      className={cn(fieldBase, "font-mono tabular-nums", className)}
      value={shown}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setText(null);
      }}
      {...props}
    />
  );
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

export function TextArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "studio-scroll resize-y leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, "cursor-pointer appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Chip({
  className,
  tone = "neutral",
  selected = false,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "neutral" | "primary" | "success" | "warning" | "error";
  selected?: boolean;
}) {
  const interactive = typeof props.onClick === "function";
  const classes = cn(
    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium tracking-tight transition-colors",
    interactive ? "studio-state cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70" : "cursor-default",
    selected
      ? "border-transparent bg-(--m3-secondary-container) text-(--m3-on-secondary-container)"
      : "border-(--m3-outline-variant) bg-transparent text-(--m3-on-surface-variant)",
    tone === "primary" && !selected && "text-(--m3-primary)",
    tone === "success" && !selected && "border-(--m3-success)/30 text-(--m3-success)",
    tone === "warning" && !selected && "border-(--m3-warning)/30 text-(--m3-warning)",
    tone === "error" && !selected && "border-(--m3-error)/30 text-(--m3-error)",
    className,
  );
  // A label chip is a span, so it can sit inside a button (a vector row, a list item) without nesting buttons.
  if (!interactive) {
    return (
      <span className={classes} title={props.title}>
        {children}
      </span>
    );
  }
  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
  label,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  /** What the choice is about, for screen readers ("Range"). */
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex overflow-hidden rounded-full border border-(--m3-outline) p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "studio-state cursor-pointer rounded-full font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3.5 text-xs",
              active
                ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)"
                : "text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Section({
  title,
  meta,
  action,
  className,
  children,
}: {
  title: string;
  /** Next to the title (a count, a status). */
  meta?: React.ReactNode;
  /** Right of the title; wraps under it when the pane is narrow. */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-(--m3-outline-variant) bg-(--m3-surface-container-low) p-4",
        className,
      )}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex items-center gap-2">
          <h3 className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-(--m3-on-surface-variant)">
            {title}
          </h3>
          {meta}
        </div>
        {action ? <div className="ml-auto flex flex-wrap items-center justify-end gap-1">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

const STATUS_TONE: Record<VectorStatus, string> = {
  pending: "bg-(--m3-warning)",
  processing: "bg-(--m3-warning) studio-pulse",
  ready: "bg-(--m3-success)",
  error: "bg-(--m3-error)",
};

export function StatusDot({ status, className }: { status: VectorStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", STATUS_TONE[status], className)}
    />
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--m3-surface-container-high) text-(--m3-primary)">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-(--m3-on-surface)">{title}</p>
        {body ? <p className="mt-1 max-w-[28ch] text-xs leading-relaxed text-(--m3-on-surface-variant)">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}
