"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { fitChips } from "@/lib/studio/chip-overflow";
import { Chip } from "./ui";

export type ChipRowItem = { key: string; label: string; selected: boolean; onSelect: () => void };

/** Space between chips (px): the same in the row and in the arithmetic that fits it. */
const GAP = 6;

/**
 * A row of single-choice filter chips that never cuts one: it shows as many whole chips as fit
 * the pane on one line (always the first and the selected one) and an "N more" chip that unfolds the
 * rest in place, wrapping onto more lines. It follows the pane as it is resized.
 */
export function ChipRow({ label, items }: { /** Accessible name of the group, e.g. "Muscle group". */ label: string; items: ChipRowItem[] }) {
  const id = useId();
  const row = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [measure, setMeasure] = useState<{ available: number; widths: number[]; more: number } | null>(null);
  const labels = items.map((item) => item.label).join("\n");

  // The ruler holds every chip at its natural width, out of sight: measured before paint, and
  // again whenever the pane changes width or the web font arrives.
  useLayoutEffect(() => {
    const rowEl = row.current;
    const rulerEl = ruler.current;
    if (!rowEl || !rulerEl) return;
    const read = () => {
      const chips = [...rulerEl.children].map((chip) => Math.ceil(chip.getBoundingClientRect().width));
      const more = chips.pop() ?? 0;
      const available = Math.floor(rowEl.getBoundingClientRect().width);
      setMeasure((m) => (m && m.available === available && m.more === more && m.widths.join() === chips.join() ? m : { available, widths: chips, more }));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(rowEl);
    observer.observe(rulerEl);
    void document.fonts?.ready.then(read);
    return () => observer.disconnect();
  }, [labels]);

  // Folding swaps the "N more" chip for "Less" (and back): focus follows the one that replaces it.
  const refocus = useRef(false);
  const toggle = (next: boolean) => {
    refocus.current = true;
    setExpanded(next);
  };
  useLayoutEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    row.current?.querySelector<HTMLElement>("[data-chip-toggle]")?.focus();
  }, [expanded]);

  const selected = items.findIndex((item) => item.selected);
  const shown = measure && measure.widths.length === items.length
    ? fitChips({ widths: measure.widths, available: measure.available, gap: GAP, moreWidth: measure.more, pinned: selected > 0 ? selected : null })
    : items.map((_, index) => index);
  const hidden = items.length - shown.length;
  // Unfolded only while there is something folded: in a pane wide enough for all, it is one line.
  const unfolded = expanded && hidden > 0;
  const visible = unfolded ? items : shown.map((index) => items[index]);
  const moreLabel = (count: number) => `${count} more`;

  return (
    <div className="relative">
      <div
        ref={row}
        id={id}
        role="group"
        aria-label={label}
        style={{ gap: GAP }}
        // Until it is measured (one frame at most) the row hides what would not fit instead of cutting it.
        className={unfolded ? "flex flex-wrap" : measure ? "flex" : "flex h-7 flex-wrap overflow-hidden"}
      >
        {visible.map((item) => (
          <Chip key={item.key} selected={item.selected} aria-pressed={item.selected} onClick={item.onSelect}>
            {item.label}
          </Chip>
        ))}
        {unfolded ? (
          <Chip data-chip-toggle aria-expanded aria-controls={id} aria-label={`Show fewer choices for ${label.toLowerCase()}`} onClick={() => toggle(false)} tone="primary">
            Less
            <ChevronUp className="h-3 w-3" aria-hidden />
          </Chip>
        ) : hidden > 0 ? (
          <Chip data-chip-toggle aria-expanded={false} aria-controls={id} aria-label={`Show ${hidden} more choices for ${label.toLowerCase()}`} onClick={() => toggle(true)} tone="primary">
            {moreLabel(hidden)}
            <ChevronDown className="h-3 w-3" aria-hidden />
          </Chip>
        ) : null}
      </div>
      {/* The ruler: every chip and the widest "more" chip, never seen, read or focused. */}
      <div ref={ruler} inert aria-hidden style={{ gap: GAP }} className="sr-only flex whitespace-nowrap">
        {items.map((item) => (
          <Chip key={item.key}>{item.label}</Chip>
        ))}
        <Chip>
          {moreLabel(items.length - 1)}
          <ChevronDown className="h-3 w-3" />
        </Chip>
      </div>
    </div>
  );
}
