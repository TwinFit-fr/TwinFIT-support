"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PointMarks } from "../hooks/use-point-marks";
import { MARK_WORDS, PointMark, noAutoWords, type MarkKind } from "../point-mark";

type Item = { kind: Exclude<MarkKind, "plain">; count: number | null };

/**
 * What the marks on the body points mean, always on the stage under the status cards: each mark
 * with its name (and how many points are set by you or pinned in this pose), and a "?" that opens
 * the meaning of each in plain words. "At its limit" lights up while a drag is at
 * its limit. The card lets presses through to the body points under it (only "?" takes them),
 * so a point panned behind it can still be grabbed. Without a template behind the poses there is no automatic pose, so only the pins and
 * the limit are explained.
 */
export function PointLegend({ marks, limit }: { marks: PointMarks; limit: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const setCount = marks.states ? Object.values(marks.states).filter((s) => s === "set").length : null;
  const items: Item[] = [
    ...(marks.states ? ([{ kind: "automatic", count: null }, { kind: "set", count: setCount }] as Item[]) : []),
    { kind: "pinned", count: marks.pinned.length },
    { kind: "limit", count: null },
  ];

  // Escape or a press outside closes the explanations.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      toggle.current?.focus();
    };
    const onDown = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  return (
    <div ref={root} className="pointer-events-none relative" data-point-legend>
      {open ? (
        <div id={panelId} role="region" aria-label="What the point marks mean" className="pointer-events-auto absolute top-[calc(100%+6px)] left-0 z-10 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-(--m3-outline-variant) bg-(--m3-surface-container-high) p-3 text-[11px] shadow-2xl" data-point-legend-help>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="font-semibold text-(--m3-on-surface)">Points on the body</p>
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
            {(["automatic", "set", "pinned", "limit"] as const).map((kind) => (
              <li key={kind} className={cn("flex items-start gap-2", !marks.states && (kind === "automatic" || kind === "set") && "opacity-60")}>
                <PointMark kind={kind} size={16} className="mt-px" />
                <span className="leading-snug text-(--m3-on-surface-variant)">
                  <span className="font-semibold text-(--m3-on-surface)">{MARK_WORDS[kind].label}.</span> {MARK_WORDS[kind].meaning}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-(--m3-outline-variant) pt-2 leading-snug text-(--m3-on-surface-variant)">
            {marks.states ? (
              <>
                Select a point: <kbd className="font-mono text-(--m3-on-surface)">A</kbd> gives it back to automatic, <kbd className="font-mono text-(--m3-on-surface)">P</kbd> pins or unpins a hand, knee or foot.
              </>
            ) : (
              `${noAutoWords(marks.missing)} Select a hand, knee or foot and press P to pin it.`
            )}
          </p>
        </div>
      ) : null}
      <div className="studio-glass pointer-events-none w-max min-w-[9.75rem] rounded-2xl px-1.5 pt-1 pb-1.5 text-[11px] text-(--m3-on-surface-variant) select-none">
        <div className="flex items-center justify-between gap-2 pl-1.5">
          <p className="text-[10px] font-semibold tracking-[0.14em] uppercase">Points</p>
          <button
            ref={toggle}
            type="button"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-label="What do the point marks mean?"
            title="What do the point marks mean?"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "studio-state pointer-events-auto inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70",
              open ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)",
            )}
          >
            <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <ul className="space-y-px" aria-label="Point marks on the body">
          {items.map(({ kind, count }) => (
            <li
              key={kind}
              className="point-legend-item flex items-center gap-2 rounded-lg px-1.5 py-[3px]"
              data-live={kind === "limit" && limit ? "" : undefined}
              data-legend={kind}
              title={MARK_WORDS[kind].meaning}
            >
              <PointMark kind={kind} size={15} />
              <span className="whitespace-nowrap text-(--m3-on-surface)">{MARK_WORDS[kind].label}</span>
              {count ? <span className="ml-auto pl-2 font-semibold tabular-nums text-(--m3-on-surface)">{count}</span> : null}
              <span className="sr-only">{`: ${MARK_WORDS[kind].meaning}`}</span>
            </li>
          ))}
        </ul>
        {!marks.states ? (
          <p className="mt-0.5 max-w-[11rem] px-1.5 leading-snug">
            {marks.missing === "unmatched" ? "Poses added or removed: no automatic pose to compare with." : "Not from a template: no automatic pose to compare with."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
