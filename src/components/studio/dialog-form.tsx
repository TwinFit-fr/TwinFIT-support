"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, FileUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton, M3Button } from "./ui";

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The ids a row's control points at: aria-describedby lists the hint and the error that are shown. */
export function rowDescription(id: string, parts: { hint?: React.ReactNode; error?: string | null }): { "aria-describedby"?: string; "aria-invalid"?: true } {
  const ids = [parts.error ? `${id}-error` : null, parts.hint ? `${id}-hint` : null].filter(Boolean).join(" ");
  return { ...(ids ? { "aria-describedby": ids } : {}), ...(parts.error ? { "aria-invalid": true as const } : {}) };
}

/** A titled block of rows in a dialog body. */
export function DialogSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("[&+&]:mt-3 [&+&]:border-t [&+&]:border-(--m3-outline-variant) [&+&]:pt-3", className)}>
      <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-(--m3-primary)">{title}</h3>
      {children}
    </section>
  );
}

/**
 * One setting: its label on the left, the control on the right, and under the control a hint or,
 * once something is wrong, what to fix (the error replaces the hint). `id` is the control's id;
 * give the control `rowDescription(id, …)` too. `group` labels a group of buttons instead.
 */
export function DialogRow({
  id,
  label,
  hint,
  error,
  optional = false,
  group = false,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  optional?: boolean;
  group?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const caption = (
    <>
      {label}
      {optional ? <span className="ml-1.5 font-normal text-(--m3-on-surface-variant)">optional</span> : null}
    </>
  );
  return (
    <div role={group ? "group" : undefined} aria-labelledby={group ? `${id}-label` : undefined} className={cn("grid grid-cols-[136px_minmax(0,1fr)] items-start gap-x-4 py-1.5", className)} data-row={id}>
      {group ? (
        <span id={`${id}-label`} className="pt-2 text-[13px] font-medium leading-snug text-(--m3-on-surface)">
          {caption}
        </span>
      ) : (
        <label htmlFor={id} className="pt-2.5 text-[13px] font-medium leading-snug text-(--m3-on-surface)">
          {caption}
        </label>
      )}
      <div className="min-w-0">
        {children}
        {error ? (
          <p id={`${id}-error`} data-field-error className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-(--m3-error)">
            <AlertCircle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        ) : hint ? (
          <p id={`${id}-hint`} className="mt-1.5 text-[12px] leading-snug text-(--m3-on-surface-variant)">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** A thumbnail of a chosen image, read once per file. */
function useThumbnail(file: File | null, enabled: boolean): string | null {
  const [thumb, setThumb] = useState<{ file: File; src: string } | null>(null);
  useEffect(() => {
    if (!enabled || !file) return;
    let live = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (live) setThumb({ file, src: String(reader.result) });
    };
    reader.readAsDataURL(file);
    return () => {
      live = false;
    };
  }, [file, enabled]);
  return enabled && file && thumb?.file === file ? thumb.src : null;
}

/**
 * A file picker that works from the keyboard: a real button opens the system picker (the input
 * itself stays out of the tab order), the chosen file shows with its size (and, for an image, a
 * thumbnail) and can be cleared. Dismissing the system picker changes nothing.
 */
export function FilePick({
  id,
  accept,
  file,
  onPick,
  placeholder,
  buttonLabel = "Choose file…",
  preview = false,
  describedBy,
}: {
  id: string;
  accept: string;
  file: File | null;
  onPick: (file: File | null) => void;
  placeholder: string;
  buttonLabel?: string;
  /** Show a thumbnail of the chosen image. */
  preview?: boolean;
  describedBy?: Record<string, unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const thumb = useThumbnail(file, preview);
  return (
    <div className={cn("flex min-h-10 items-center gap-2 rounded-xl border border-(--m3-outline) bg-(--m3-surface-container-high) py-1 pr-1", thumb ? "pl-1" : "pl-3.5")}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local data URL of the chosen file
        <img src={thumb} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-(--m3-surface-container-highest) object-contain" data-file-thumb />
      ) : null}
      <span className={cn("min-w-0 flex-1 truncate text-sm", file ? "text-(--m3-on-surface)" : "text-(--m3-on-surface-variant)")} data-file-name>
        {file ? (
          <>
            {file.name} <span className="text-[12px] text-(--m3-on-surface-variant)">· {fileSize(file.size)}</span>
          </>
        ) : (
          placeholder
        )}
      </span>
      {file ? (
        <IconButton label={`Remove ${file.name}`} onClick={() => onPick(null)} className="h-8 w-8">
          <X aria-hidden className="h-3.5 w-3.5" />
        </IconButton>
      ) : null}
      <M3Button id={id} size="sm" variant="tonal" onClick={() => input.current?.click()} {...describedBy}>
        <FileUp aria-hidden className="h-3.5 w-3.5" /> {file ? "Change…" : buttonLabel}
      </M3Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        tabIndex={-1}
        aria-hidden
        className="hidden"
        data-file-input={id}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </div>
  );
}
