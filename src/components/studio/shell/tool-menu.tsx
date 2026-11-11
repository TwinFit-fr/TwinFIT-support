"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ToolButton } from "./tool-button";

export type ToolMenuItem = {
  label: string;
  icon?: React.ReactNode;
  /** A second line under the label. */
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
};

/**
 * A top-bar menu (WAI-ARIA menu button): opens under its trigger, arrow keys / Home / End move
 * between items, Enter or Space picks one, Escape and Tab close it and give focus back.
 */
export function ToolMenu({
  label,
  icon,
  text,
  textClassName,
  items,
  align = "end",
}: {
  label: string;
  icon: React.ReactNode;
  text?: string;
  textClassName?: string;
  items: ToolMenuItem[];
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const itemsIn = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])") ?? [])];
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not([disabled])")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onMenuKey = (event: React.KeyboardEvent) => {
    const list = itemsIn();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      event.preventDefault();
      list[(to + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") close(false);
  };

  return (
    <div className="relative">
      <ToolButton
        ref={trigger}
        label={label}
        text={text}
        textClassName={textClassName}
        tipAlign={align}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon}
      </ToolButton>
      {open ? (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 w-72 rounded-(--studio-radius-md) border border-(--m3-outline) bg-(--m3-surface-container-high) p-(--studio-space-1) shadow-(--studio-float-shadow)",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
              className="studio-state flex w-full cursor-pointer items-start gap-(--studio-space-3) rounded-(--studio-radius-sm) px-(--studio-space-3) py-(--studio-space-2) text-left text-(length:--studio-text-sm) text-(--m3-on-surface) outline-none focus-visible:bg-(--m3-surface-container-highest) focus-visible:ring-1 focus-visible:ring-(--m3-primary)/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {item.icon ? <span className="mt-0.5 shrink-0 text-(--m3-on-surface-variant)">{item.icon}</span> : null}
              <span className="min-w-0">
                <span className="block">{item.label}</span>
                {item.hint ? <span className="mt-0.5 block text-(length:--studio-text-xs) leading-snug text-(--m3-on-surface-variant)">{item.hint}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
