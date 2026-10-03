"use client";

import { useEffect, useState } from "react";
import type { QueueStep } from "@/hooks/use-generation-queue";
import { framePositionLabel } from "@/lib/images/types";
import { cn } from "@/lib/utils";

export function useElapsedSeconds(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
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
