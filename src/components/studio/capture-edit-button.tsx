"use client";

import { Loader2, PenLine } from "lucide-react";
import type { MovementVector } from "@/lib/studio/types";
import { useCaptureEdit } from "./hooks/use-capture-edit";
import { M3Button } from "./ui";

/** What is happening with a capture being made into key poses, in words ("Reading 121 frames… 40 %"). */
export function useCaptureProgress(vectorId: string | null): string | null {
  return useCaptureEdit((s) => {
    const job = s.job;
    if (!job || job.vectorId !== vectorId) return null;
    if (job.stage === "waiting") return "Loading the capture on the stage…";
    const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
    return `Reading ${job.total} frames into key poses… ${pct} %`;
  });
}

/**
 * "Edit as key poses" for a capture row: the motion becomes a few key poses in the pose editor.
 * While it is read, the button says how far it has got.
 */
export function CaptureEditButton({ vector, onEdit, variant = "filled", size = "md", className }: { vector: MovementVector; onEdit: (vector: MovementVector) => void; variant?: "filled" | "tonal"; size?: "sm" | "md"; className?: string }) {
  const progress = useCaptureProgress(vector.id);
  return (
    <M3Button
      variant={variant}
      size={size}
      onClick={() => onEdit(vector)}
      disabled={Boolean(progress)}
      title={`Turn capture #${vector.seq} into a few key poses you can edit; the capture itself stays as it is`}
      className={className}
      data-capture-edit={vector.id}
    >
      {progress ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PenLine className="h-4 w-4" aria-hidden="true" />}
      Edit as key poses
    </M3Button>
  );
}

/** The progress line under the button, announced politely. */
export function CaptureProgressLine({ vectorId, className }: { vectorId: string; className?: string }) {
  const progress = useCaptureProgress(vectorId);
  return (
    <p role="status" aria-live="polite" className={className} data-capture-progress={progress ? "" : undefined}>
      {progress ?? ""}
    </p>
  );
}
