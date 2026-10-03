"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { QueueItem, QueueStep } from "@/hooks/use-generation-queue";
import { framePositionLabel } from "@/lib/images/types";
import { cn } from "@/lib/utils";

function useElapsedSeconds(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
}

export function processingSteps(item: QueueItem | undefined): QueueStep[] {
  return item?.steps.filter((s) => s.status === "processing") ?? [];
}

const SEGMENT_CLASS: Record<QueueStep["status"], string> = {
  waiting: "bg-zinc-200",
  processing: "bg-zinc-900 animate-pulse",
  done: "bg-emerald-500",
  error: "bg-red-500",
  cancelled: "bg-zinc-100",
};

export function StepSegments({ steps, className }: { steps: QueueStep[]; className?: string }) {
  return (
    <div className={cn("flex gap-1", className)}>
      {steps.map((step) => (
        <div
          key={step.position}
          title={`${framePositionLabel(step.position)}: ${step.status}${step.error ? ` — ${step.error}` : ""}`}
          className={cn("h-1.5 flex-1 rounded-full", SEGMENT_CLASS[step.status])}
        />
      ))}
    </div>
  );
}

const STEP_MARK: Record<QueueStep["status"], string> = {
  waiting: "…",
  processing: "⟳",
  done: "✓",
  error: "✕",
  cancelled: "–",
};

/** Inline "Start ✓ · Mid ⟳ · End …" trail. */
export function StepTrail({ steps }: { steps: QueueStep[] }) {
  return (
    <span className="whitespace-nowrap">
      {steps.map((step, i) => (
        <span
          key={step.position}
          title={step.error}
          className={cn(
            step.status === "error" && "text-red-600",
            step.status === "done" && "text-emerald-700",
            step.status === "processing" && "font-medium text-zinc-900",
          )}
        >
          {i > 0 ? " · " : ""}
          {framePositionLabel(step.position)} {STEP_MARK[step.status]}
        </span>
      ))}
    </span>
  );
}

/** Progress panel for one exercise generating its positions (in parallel). */
export function GenerationProgress({
  item,
  running,
  onCancel,
}: {
  item: QueueItem | undefined;
  running: boolean;
  /** Omit to hide the cancel control (e.g. when several panels share one queue). */
  onCancel?: () => void;
}) {
  const active = processingSteps(item);
  const firstStart = active.reduce<number | undefined>(
    (min, s) => (s.startedAt && (!min || s.startedAt < min) ? s.startedAt : min),
    undefined,
  );
  const elapsed = useElapsedSeconds(firstStart);
  if (!item) return null;

  const total = item.steps.length;
  const done = item.steps.filter((s) => s.status === "done").length;
  const failed = item.steps.filter((s) => s.status === "error");

  return (
    <div
      className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2 text-zinc-800">
          {running && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
          {active.length ? (
            <span>
              Generating {active.map((s) => framePositionLabel(s.position)).join(", ")} ·{" "}
              {item.subject} · {done}/{total} done{" "}
              <span className="tabular-nums text-zinc-500">{elapsed}s</span>
            </span>
          ) : running ? (
            <span>Preparing…</span>
          ) : (
            <span>
              Finished ({item.subject}): {done}/{total} image{total === 1 ? "" : "s"} generated
              {failed.length ? ` · ${failed.length} failed` : ""}
            </span>
          )}
        </div>
        {running && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-zinc-500 hover:text-zinc-800"
          >
            Cancel pending
          </button>
        )}
      </div>
      <StepSegments steps={item.steps} />
      {failed.map((step) => (
        <p key={step.position} className="text-xs text-red-600">
          {framePositionLabel(step.position)}: {step.error}
        </p>
      ))}
    </div>
  );
}
