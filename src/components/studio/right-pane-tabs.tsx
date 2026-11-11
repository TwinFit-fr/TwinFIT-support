"use client";

import { useRef } from "react";
import { ListVideo, PersonStanding } from "lucide-react";
import { cn } from "@/lib/utils";

export type RightTab = "poses" | "clips";

export const RIGHT_TAB_IDS: Record<RightTab, { tab: string; panel: string }> = {
  poses: { tab: "studio-tab-poses", panel: "studio-panel-poses" },
  clips: { tab: "studio-tab-clips", panel: "studio-panel-clips" },
};

/**
 * The right pane's two views of the selected exercise: the poses on the stage (where picking an
 * exercise lands) and, second, its saved clips with the background generator. Arrow keys move
 * between the tabs (WAI-ARIA tabs pattern, automatic activation).
 */
export function RightPaneTabs({ value, onChange, clipCount }: { value: RightTab; onChange: (tab: RightTab) => void; clipCount: number }) {
  const refs = useRef<Record<RightTab, HTMLButtonElement | null>>({ poses: null, clips: null });
  const tabs: { id: RightTab; label: string; icon: typeof ListVideo; count?: number }[] = [
    { id: "poses", label: "Poses", icon: PersonStanding },
    { id: "clips", label: "Clips & queue", icon: ListVideo, count: clipCount },
  ];
  const move = (to: RightTab) => {
    onChange(to);
    refs.current[to]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Exercise views"
      className="flex shrink-0 gap-1 border-b border-(--m3-outline-variant) px-2 pt-1.5"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End") {
          event.preventDefault();
          move(event.key === "Home" ? "poses" : event.key === "End" ? "clips" : value === "poses" ? "clips" : "poses");
        }
      }}
    >
      {tabs.map(({ id, label, icon: Icon, count }) => {
        const selected = id === value;
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            id={RIGHT_TAB_IDS[id].tab}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={RIGHT_TAB_IDS[id].panel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            className={cn(
              "studio-state relative -mb-px flex h-9 cursor-pointer items-center gap-1.5 rounded-t-(--studio-radius-md) px-3 text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--m3-primary)/70",
              selected
                ? "text-(--m3-on-surface) before:absolute before:inset-x-2 before:bottom-0 before:h-0.5 before:rounded-full before:bg-(--m3-primary)"
                : "text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {count ? (
              <>
                <span aria-hidden className="rounded-full bg-(--m3-surface-container-highest) px-1.5 text-[10px] tabular-nums text-(--m3-on-surface-variant)">
                  {count}
                </span>
                <span className="sr-only">, {count} clips</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
