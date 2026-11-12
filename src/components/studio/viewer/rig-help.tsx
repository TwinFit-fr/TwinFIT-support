"use client";

import { useCallback, useId, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDismiss } from "../hooks/use-dismiss";
import { PointMark } from "../point-mark";
import { CameraHelp } from "./view-controls";

const KEY = "rounded border border-(--m3-outline-variant) px-1 font-mono text-[10px] leading-4 text-(--m3-on-surface)";

/** The rig editor's shortcuts, for the stage's help (here and in the pose editor's legend). */
export const RIG_KEYS = { move: "M", rotate: "T" } as const;

/** What the rig editor's keys and gestures do, as a section of the stage's help popover. */
export function RigHelp() {
  return (
    <div className="mt-2 border-t border-(--m3-outline-variant) pt-2" data-rig-help>
      <p className="mb-1 font-semibold text-(--m3-on-surface)">Rig editor</p>
      <ul className="space-y-1 leading-snug text-(--m3-on-surface-variant)">
        <li>
          <kbd className={KEY}>{RIG_KEYS.move}</kbd> Move and <kbd className={KEY}>{RIG_KEYS.rotate}</kbd> Rotate choose what the gizmo does.
        </li>
        <li>Drag an attachment point on the body to move it in the view; the gizmo moves or turns it along one axis.</li>
        <li>
          Arrow keys nudge the selected point 1 mm (<kbd className={KEY}>Shift</kbd> 10 mm); <kbd className={KEY}>Esc</kbd> clears the selection.
        </li>
        <li>
          <kbd className={KEY}>Ctrl+Z</kbd> undoes, <kbd className={KEY}>Ctrl+Shift+Z</kbd> redoes.
        </li>
      </ul>
    </div>
  );
}

const MEANING = {
  detected: "Placed automatically when the avatar was made (from the rig's bone names, or with the mannequin) and not moved since.",
  set: "Moved from where it was detected, or added by hand. A moved point can be reset to where it was detected.",
};

/**
 * The rig editor's legend on the stage, under the status cards: what the two point marks mean,
 * and a "?" that opens the rig editor's and the camera's keys.
 */
export function RigLegend({ equipment }: { equipment: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root, toggle);

  return (
    <div ref={root} className="pointer-events-none relative" data-rig-legend>
      {open ? (
        <div id={panelId} role="region" aria-label="The rig editor's marks and keys" className="pointer-events-auto absolute top-[calc(100%+6px)] left-0 z-10 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-(--m3-outline-variant) bg-(--m3-surface-container-high) p-3 text-[11px] shadow-2xl" data-rig-legend-help>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="font-semibold text-(--m3-on-surface)">Attachment points</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                toggle.current?.focus();
              }}
              aria-label="Close the explanations"
              className="studio-state -mr-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-(--m3-on-surface-variant) outline-none hover:text-(--m3-on-surface) focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <ul className="space-y-1.5">
            <li className="flex items-start gap-2">
              <PointMark kind="automatic" size={16} className="mt-px" />
              <span className="leading-snug text-(--m3-on-surface-variant)">
                <span className="font-semibold text-(--m3-on-surface)">Auto-detected.</span> {MEANING.detected}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <PointMark kind="set" size={16} className="mt-px" />
              <span className="leading-snug text-(--m3-on-surface-variant)">
                <span className="font-semibold text-(--m3-on-surface)">Moved or added.</span> {MEANING.set}
              </span>
            </li>
          </ul>
          <RigHelp />
          <CameraHelp />
        </div>
      ) : null}
      <div className="studio-glass pointer-events-none w-max min-w-[9.75rem] rounded-2xl px-1.5 pt-1 pb-1.5 text-[11px] text-(--m3-on-surface-variant) select-none">
        <div className="flex items-center justify-between gap-2 pl-1.5">
          <p className="text-[10px] font-semibold tracking-[0.14em] uppercase">{equipment ? "Equipment" : "Attachment points"}</p>
          <button
            ref={toggle}
            type="button"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-label="What do the marks mean? Rig editor and camera keys"
            title="What the marks mean, the rig editor's and the camera's keys"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "studio-state pointer-events-auto inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70",
              open ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)",
            )}
          >
            <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        {equipment ? (
          <p className="max-w-[12rem] px-1.5 pt-0.5 leading-snug">Each point is where a generated model sits on its attachment point.</p>
        ) : (
          <ul className="space-y-px" aria-label="Attachment point marks">
            <li className="flex items-center gap-2 rounded-lg px-1.5 py-[3px]" title={MEANING.detected}>
              <PointMark kind="automatic" size={15} />
              <span className="whitespace-nowrap text-(--m3-on-surface)">Auto-detected</span>
              <span className="sr-only">{`: ${MEANING.detected}`}</span>
            </li>
            <li className="flex items-center gap-2 rounded-lg px-1.5 py-[3px]" title={MEANING.set}>
              <PointMark kind="set" size={15} />
              <span className="whitespace-nowrap text-(--m3-on-surface)">Moved or added</span>
              <span className="sr-only">{`: ${MEANING.set}`}</span>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
