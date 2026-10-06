"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export type TabItem<T extends string> = { id: T; label: string; badge?: React.ReactNode };

export const tabId = (id: string) => `tab-${id}`;
export const tabPanelId = (id: string) => `tabpanel-${id}`;

/**
 * A tablist following the WAI-ARIA tabs pattern: one tab in the tab order, arrow keys / Home /
 * End move between tabs and select them. Pair each tab with <TabPanel id={…}>.
 */
export function TabList<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  function move(event: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index + last) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current.get(tabs[next].id)?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-zinc-200">
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            aria-selected={selected}
            aria-controls={tabPanelId(tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition",
              "focus-visible:rounded-t-md focus-visible:outline-2 focus-visible:outline-zinc-400",
              selected
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
            )}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

/** A tab's content; hidden panels stay mounted, so drafts in them survive switching tabs. */
export function TabPanel({
  id,
  selected,
  children,
}: {
  id: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      role="tabpanel"
      id={tabPanelId(id)}
      aria-labelledby={tabId(id)}
      hidden={!selected}
      className="space-y-4 pt-4"
    >
      {children}
    </section>
  );
}
