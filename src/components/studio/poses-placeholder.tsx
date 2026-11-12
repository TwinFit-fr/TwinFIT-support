"use client";

import { Activity, Film, LayoutTemplate, ListVideo, TriangleAlert } from "lucide-react";
import { isCaptureFormat } from "@/lib/studio/capture-convert";
import type { ClipProblem } from "@/lib/studio/clip-problems";
import type { LandingPlan } from "@/lib/studio/landing";
import type { MovementVector } from "@/lib/studio/types";
import { CaptureEditButton, CaptureProgressLine } from "./capture-edit-button";
import { useClipProblem } from "./hooks/use-clip-problems";
import { M3Button } from "./ui";

/**
 * A clip that cannot be edited here (its file did not load, or a .json holds no poses): what is
 * wrong, in words, and the ways on: the template, or another file from Clips & queue.
 */
function ClipProblemCard({ vector, problem, onStartFromTemplate, onOpenClips }: { vector: MovementVector; problem: ClipProblem; onStartFromTemplate: () => void; onOpenClips: () => void }) {
  const unreadable = problem.kind === "unreadable";
  return (
    <div className="flex flex-col gap-3 p-4" data-poses-placeholder="problem" data-problem-kind={problem.kind}>
      <div role="status" aria-live="polite" className="flex items-start gap-2.5">
        <span className={unreadable ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-(--studio-radius-md) bg-(--m3-error-container) text-(--m3-error)" : "flex h-7 w-7 shrink-0 items-center justify-center rounded-(--studio-radius-md) bg-(--m3-surface-container-highest) text-(--m3-warning)"}>
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-(length:--studio-text-sm) font-semibold leading-tight text-pretty">{problem.title}</p>
          <p className="mt-0.5 text-[11px] text-(--m3-on-surface-variant)">
            {[`${vector.format.toUpperCase()} file`, unreadable ? problem.short : "plays as it is"].join(" · ")}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-(--m3-on-surface)">{problem.detail}</p>
        </div>
      </div>
      <M3Button variant="filled" onClick={onStartFromTemplate} className="w-full">
        <LayoutTemplate className="h-4 w-4" aria-hidden="true" /> Start poses from the template
      </M3Button>
      <M3Button variant="text" size="sm" onClick={onOpenClips} className="self-start px-2">
        <ListVideo className="h-4 w-4" aria-hidden="true" /> Use another clip or file
      </M3Button>
    </div>
  );
}

/**
 * What the Poses tab shows in the moment before the editor holds poses (a clip downloading), or
 * while the exercise's clip is a motion capture that plays: it can be turned into key poses
 * there (the capture row itself stays as it is), or the template can be the start instead. A
 * clip whose file did not load, or a .json without poses, says so in words (ClipProblemCard).
 */
export function PosesPlaceholder({
  plan,
  onStartFromTemplate,
  onEditCapture,
  onOpenClips,
}: {
  plan: LandingPlan<MovementVector> | null;
  onStartFromTemplate: () => void;
  onEditCapture: (vector: MovementVector) => void;
  /** Show Clips & queue (another clip, or a new file for this one). */
  onOpenClips: () => void;
}) {
  const problem = useClipProblem(plan?.kind === "play" ? plan.vector : null);
  if (plan?.kind === "play" && problem) return <ClipProblemCard vector={plan.vector} problem={problem} onStartFromTemplate={onStartFromTemplate} onOpenClips={onOpenClips} />;
  if (plan?.kind === "play") {
    const vector = plan.vector;
    const capture = isCaptureFormat(vector.format);
    const seconds = vector.duration_ms ? `${(vector.duration_ms / 1000).toFixed(1)} s` : null;
    return (
      <div className="flex flex-col gap-3 p-4" data-poses-placeholder="capture">
        <div className="flex items-start gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-(--studio-radius-md) bg-(--m3-surface-container-highest)">
            {capture ? <Activity className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0">
            <p className="text-(length:--studio-text-sm) font-semibold leading-tight">
              {capture ? "Capture" : "Clip"} #{vector.seq} is playing
            </p>
            <p className="mt-0.5 text-[11px] text-(--m3-on-surface-variant)">
              {[`${vector.format.toUpperCase()} motion capture`, seconds, vector.fps ? `${vector.fps} fps` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {capture ? (
          <>
            <p className="text-[12px] leading-snug text-(--m3-on-surface)">
              Every frame of it is a pose of its own. Edit it as a few key poses instead: the body points, the timeline and the body checks work on them as on any draft, and saving makes a new pose clip.
            </p>
            <CaptureEditButton vector={vector} onEdit={onEditCapture} className="w-full" />
            <CaptureProgressLine vectorId={vector.id} className="-mt-1 text-[11px] leading-snug text-(--m3-on-surface-variant) empty:hidden" />
            <p className="text-[11px] leading-snug text-(--m3-on-surface-variant)">Capture #{vector.seq} itself is kept as it is.</p>
            <M3Button variant="text" size="sm" onClick={onStartFromTemplate} className="self-start px-2">
              <LayoutTemplate className="h-4 w-4" /> Start from the template instead
            </M3Button>
          </>
        ) : (
          <>
            <p className="text-[11px] leading-snug text-(--m3-on-surface-variant)">This clip is not a set of poses, so it cannot be adjusted here. Start poses from the exercise&apos;s template to make an editable version.</p>
            <M3Button variant="filled" onClick={onStartFromTemplate}>
              <LayoutTemplate className="h-4 w-4" /> Start poses from the template
            </M3Button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 p-4" role="status" aria-live="polite">
      <p className="text-[12px] text-(--m3-on-surface-variant)">{plan?.kind === "edit" ? `Opening clip #${plan.vector.seq}…` : "Preparing the poses…"}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-9 rounded-(--studio-radius-md) bg-(--m3-surface-container) motion-safe:animate-pulse" />
      ))}
    </div>
  );
}
