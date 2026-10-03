"use client";

import { cn } from "@/lib/utils";

export const selectClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm";

export function Chip({
  selected,
  disabled,
  title,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40",
        selected
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100",
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-zinc-600">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </fieldset>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {description && <p className="text-xs text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
