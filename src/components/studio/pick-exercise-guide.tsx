"use client";

import { Hand, ListChecks, Save, Search } from "lucide-react";
import type { GuideFocus } from "@/lib/studio/load-state";
import { cn } from "@/lib/utils";
import { focusCatalogSearch } from "./shell/catalog-focus";
import { PanelStatusNote } from "./stage-states";

const STEPS = [
  { icon: ListChecks, title: "Pick an exercise", body: "Its poses open on the avatar at once: the saved clip, or a draft from the exercise's template." },
  { icon: Hand, title: "Drag a body point", body: "Press a hand, foot, knee or the hips on the stage and move it. Undo with Ctrl+Z." },
  { icon: Save, title: "Save", body: "One click (or Ctrl+S) stores the clip for this exercise." },
];

/**
 * The right pane before an exercise is chosen: the whole job in three steps. With the catalog and
 * an avatar in, step 1 is marked as where to start (with a way into the catalog search); until
 * then a note above the steps says what is missing (loading, a failed list, no avatar yet) and
 * where to act, and no step claims to be the start.
 */
export function PickExerciseGuide({ focus = { kind: "pick" } }: { focus?: GuideFocus }) {
  const startHere = focus.kind === "pick";
  return (
    <div className="studio-scroll flex h-full flex-col gap-5 overflow-y-auto px-4 py-5">
      {focus.kind === "pick" ? null : <PanelStatusNote focus={focus} />}
      <div>
        <h3 className="text-(length:--studio-text-sm) font-semibold text-(--m3-on-surface)">Animate an exercise in three steps</h3>
        <p className="mt-1 text-[11px] leading-snug text-(--m3-on-surface-variant)">No setup needed: everything happens on the stage and in this panel.</p>
      </div>
      <ol className="space-y-2">
        {STEPS.map(({ icon: Icon, title, body }, i) => {
          const current = startHere && i === 0;
          return (
            <li
              key={title}
              aria-current={current ? "step" : undefined}
              className={cn("flex gap-3 rounded-(--studio-radius-lg) border p-3", current ? "border-(--m3-primary)/50 bg-(--m3-surface-container)" : "border-transparent")}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-(--studio-radius-md)",
                  current ? "bg-(--m3-primary-container) text-(--m3-on-primary-container)" : "bg-(--m3-surface-container-high) text-(--m3-on-surface-variant)",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium leading-tight text-(--m3-on-surface)">
                  <span className="tabular-nums text-(--m3-on-surface-variant)">{i + 1}</span>
                  {title}
                  {current ? <span className="rounded-full bg-(--m3-primary)/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.08em] text-(--m3-primary)">Start here</span> : null}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-(--m3-on-surface-variant)">{body}</p>
                {current ? (
                  <button
                    type="button"
                    onClick={focusCatalogSearch}
                    aria-keyshortcuts="/"
                    className="studio-state mt-2.5 inline-flex h-8 cursor-pointer items-center gap-2 rounded-full bg-(--m3-secondary-container) pl-3 pr-2 text-xs font-medium text-(--m3-on-secondary-container) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
                  >
                    <Search aria-hidden className="h-3.5 w-3.5" />
                    Search the catalog
                    <kbd aria-hidden className="rounded border border-(--m3-outline) px-1.5 font-mono text-[11px] leading-4">
                      /
                    </kbd>
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
