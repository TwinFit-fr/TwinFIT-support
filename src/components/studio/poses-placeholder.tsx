"use client";

import { Film, LayoutTemplate } from "lucide-react";
import type { LandingPlan } from "@/lib/studio/landing";
import type { MovementVector } from "@/lib/studio/types";
import { M3Button } from "./ui";

/**
 * What the Poses tab shows in the moment before the editor holds poses (a clip downloading), or
 * when the exercise's clip is not made of poses and plays instead.
 */
export function PosesPlaceholder({ plan, onStartFromTemplate }: { plan: LandingPlan<MovementVector> | null; onStartFromTemplate: () => void }) {
  if (plan?.kind === "play") {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-(--studio-radius-md) bg-(--m3-surface-container-highest)">
            <Film className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-(length:--studio-text-sm) font-semibold leading-tight">Clip #{plan.vector.seq} is playing</p>
            <p className="mt-1 text-[11px] leading-snug text-(--m3-on-surface-variant)">
              It is a {plan.vector.format.toUpperCase()} motion clip, not a set of poses, so it cannot be adjusted here. Start poses from the exercise&apos;s template to make an editable version.
            </p>
          </div>
        </div>
        <M3Button variant="filled" onClick={onStartFromTemplate}>
          <LayoutTemplate className="h-4 w-4" /> Start poses from the template
        </M3Button>
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
