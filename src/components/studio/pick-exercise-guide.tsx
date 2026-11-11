"use client";

import { Hand, ListChecks, Save } from "lucide-react";

const STEPS = [
  { icon: ListChecks, title: "Pick an exercise", body: "Its poses open on the avatar at once: the saved clip, or a draft from the exercise's template." },
  { icon: Hand, title: "Drag a body point", body: "Press a hand, foot, knee or the hips on the stage and move it. Undo with Ctrl+Z." },
  { icon: Save, title: "Save", body: "One click (or Ctrl+S) stores the clip for this exercise." },
];

/** The right pane before an exercise is chosen: the whole job in three steps. */
export function PickExerciseGuide() {
  return (
    <div className="studio-scroll flex h-full flex-col gap-5 overflow-y-auto px-4 py-5">
      <div>
        <p className="text-(length:--studio-text-sm) font-semibold text-(--m3-on-surface)">Animate an exercise in three steps</p>
        <p className="mt-1 text-[11px] leading-snug text-(--m3-on-surface-variant)">Choose one in the catalog on the left; the arrow keys step through the list.</p>
      </div>
      <ol className="space-y-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--studio-radius-md) bg-(--m3-surface-container-high) text-(--m3-primary)">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-medium leading-tight text-(--m3-on-surface)">
                <span className="mr-1.5 tabular-nums text-(--m3-on-surface-variant)">{i + 1}</span>
                {title}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-(--m3-on-surface-variant)">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
