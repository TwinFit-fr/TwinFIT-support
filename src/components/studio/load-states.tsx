"use client";

import { useState } from "react";
import { CloudOff, Loader2, RotateCw } from "lucide-react";
import { failureReason } from "@/lib/studio/load-state";
import { cn } from "@/lib/utils";
import { M3Button } from "./ui";

/**
 * The Studio's loading and failure vocabulary: one small loader, one failure block with Retry,
 * and the skeleton of the catalog list. Loading is always shown as loading and a failed request
 * as a failure, never as an empty list.
 */

/** A quiet glass pill with a spinner, centred in its box (the stage, a pane). */
export function StudioLoader({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex h-full w-full items-center justify-center p-4", className)}>
      <div className="studio-glass flex items-center gap-2.5 rounded-full px-4 py-2 text-xs text-(--m3-on-surface)">
        <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-(--m3-primary) motion-safe:animate-spin" />
        {label}
      </div>
    </div>
  );
}

/** A request that failed: what did not load, why in plain words, and Retry (no page reload). */
export function ErrorState({
  title,
  error,
  onRetry,
  className,
}: {
  /** What did not load, as a sentence ("The catalog did not load."). */
  title: string;
  error?: unknown;
  onRetry: () => unknown;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const reason = failureReason(error);
  const retry = async () => {
    setBusy(true);
    try {
      await onRetry();
    } catch {
      /* the source keeps its failed state and this block stays */
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 px-6 text-center", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-(--m3-error-container) text-(--m3-error)">
        <CloudOff aria-hidden className="h-4.5 w-4.5" />
      </span>
      <div>
        <p className="text-(length:--studio-text-sm) font-medium text-(--m3-on-surface)">{title}</p>
        {reason ? <p className="mt-1 max-w-[34ch] text-[11px] leading-snug text-(--m3-on-surface-variant)">{reason}</p> : null}
      </div>
      <M3Button size="sm" variant="tonal" busy={busy} onClick={retry}>
        {busy ? null : <RotateCw aria-hidden className="h-3.5 w-3.5" />}
        {busy ? "Retrying…" : "Retry"}
      </M3Button>
    </div>
  );
}

/** One bar of a skeleton. */
export function SkeletonBar({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-full bg-(--m3-surface-container-high) motion-safe:animate-pulse", className)} />;
}

/** The catalog list while it loads: rows shaped like the real ones (thumbnail, name, state). */
export function CatalogSkeletonRows({ rows = 10, rowHeight = 62 }: { rows?: number; rowHeight?: number }) {
  return (
    <ul aria-hidden className="px-2 pt-0.5">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} style={{ height: rowHeight }} className="flex items-center gap-3 px-2">
          <span className="h-9 w-9 shrink-0 rounded-lg bg-(--m3-surface-container-high) motion-safe:animate-pulse @[17rem]/pane:h-11 @[17rem]/pane:w-11" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <SkeletonBar className={cn("h-2.5", i % 2 ? "w-3/4" : "w-5/6")} />
            <SkeletonBar className={cn("h-2", i % 3 === 0 ? "w-2/5" : i % 3 === 1 ? "w-3/5" : "w-1/2")} />
          </span>
        </li>
      ))}
    </ul>
  );
}
