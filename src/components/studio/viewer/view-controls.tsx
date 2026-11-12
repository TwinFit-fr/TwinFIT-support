"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronUp, Focus, RotateCcw } from "lucide-react";
import { POINT_LABEL, isPointId } from "@/lib/studio/pose-points";
import { CAMERA_VIEWS, DEFAULT_VIEW, viewById, type CameraViewId } from "@/lib/studio/stage-camera";
import { useStageView } from "@/lib/studio/stage-view";
import { useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { IconButton } from "../ui";

/** The keys of the view controls, for the toolbar's shortcuts (studio-viewport.tsx) and the help. */
export const VIEW_SHORTCUTS: Record<string, () => void> = {
  ...Object.fromEntries(CAMERA_VIEWS.map((v) => [v.key, () => useStageView.getState().showView(v.id)])),
  f: () => useStageView.getState().frame(),
  r: () => useStageView.getState().reset(),
};

const viewTitle = (id: CameraViewId) => {
  const v = viewById(id);
  return `${v.name} view (${v.key})`;
};

/** The six views side by side, the one the camera is on lit; on a wide stage. */
function ViewButtons({ current }: { current: CameraViewId | null }) {
  const showView = useStageView((s) => s.showView);
  return (
    <div role="group" aria-label="View" className="hidden items-center rounded-full p-0.5 @2xl/stage:inline-flex" data-view-buttons>
      {CAMERA_VIEWS.map((v) => {
        const active = current === v.id;
        return (
          <button
            key={v.id}
            type="button"
            title={viewTitle(v.id)}
            aria-label={viewTitle(v.id)}
            aria-pressed={active}
            onClick={() => showView(v.id)}
            data-view={v.id}
            className={cn(
              "studio-state inline-flex h-7 min-w-8 cursor-pointer items-baseline gap-1 rounded-full pr-2 pl-2.5 text-[11px] leading-7 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70",
              active ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)",
            )}
          >
            {v.label}
            {/* The key, visible: the views are learnt from the toolbar itself. */}
            <span aria-hidden="true" className="font-mono text-[10px] text-(--m3-on-surface-variant)">
              {v.key}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The same choice as a menu, on a narrow stage: a button naming the view, the list above it. */
function ViewMenu({ current }: { current: CameraViewId | null }) {
  const showView = useStageView((s) => s.showView);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const start = Math.max(0, CAMERA_VIEWS.findIndex((v) => v.id === current));
    items.current[start]?.focus();
    const onDown = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open, current]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const onMenuKey = (event: React.KeyboardEvent) => {
    const list = items.current.filter((el): el is HTMLButtonElement => Boolean(el));
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      event.preventDefault();
      list[(to + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      close();
    }
  };

  return (
    <div ref={root} className="relative @2xl/stage:hidden" data-view-menu>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Choose the view (1 to 6)"
        onClick={() => setOpen((v) => !v)}
        className="studio-state inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 text-[11px] font-medium text-(--m3-on-surface) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
      >
        <span className="sr-only">View: </span>
        {current ? viewById(current).name : "Free view"}
        <ChevronUp className={cn("h-3.5 w-3.5 text-(--m3-on-surface-variant) transition-transform", !open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="View"
          onKeyDown={onMenuKey}
          className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-44 rounded-2xl border border-(--m3-outline-variant) bg-(--m3-surface-container-high) p-1 shadow-2xl"
        >
          {CAMERA_VIEWS.map((v, i) => (
            <button
              key={v.id}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={current === v.id}
              tabIndex={-1}
              onClick={() => {
                showView(v.id);
                close();
              }}
              className={cn(
                "studio-state flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70",
                current === v.id ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "text-(--m3-on-surface)",
              )}
            >
              {v.name}
              <kbd aria-hidden="true" className="rounded border border-(--m3-outline-variant) px-1 font-mono text-[10px] leading-4 text-(--m3-on-surface-variant)">
                {v.key}
              </kbd>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The view part of the stage toolbar: the six views (a menu on a narrow stage), Frame (F: the
 * whole body, or the selected point's part, in the free part of the stage) and Reset (R).
 */
export function ViewControls() {
  const current = useStageView((s) => s.current);
  const frame = useStageView((s) => s.frame);
  const reset = useStageView((s) => s.reset);
  const part = useStudioStore((s) => (s.poseEdit && isPointId(s.poseEdit.dragTarget) ? s.poseEdit.dragTarget : null));
  const frameLabel = part ? `Frame the ${POINT_LABEL[part].toLowerCase()} (F)` : "Frame the whole body (F)";
  return (
    <>
      <ViewButtons current={current} />
      <ViewMenu current={current} />
      <button
        type="button"
        onClick={frame}
        title={frameLabel}
        aria-label={frameLabel}
        data-frame-button
        className="studio-state inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-(--m3-on-surface) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
      >
        <Focus className="h-4 w-4 text-(--m3-primary)" aria-hidden="true" />
        Frame
      </button>
      <IconButton label={`Reset the view: ${viewById(DEFAULT_VIEW).name.toLowerCase()}, whole body (R)`} onClick={reset}>
        <RotateCcw className="h-4 w-4" />
      </IconButton>
    </>
  );
}

const KEY = "rounded border border-(--m3-outline-variant) px-1 font-mono text-[10px] leading-4 text-(--m3-on-surface)";

/** The camera's keys and gestures, for the stage's help (point-legend.tsx). */
export function CameraHelp() {
  return (
    <div className="mt-2 border-t border-(--m3-outline-variant) pt-2" data-camera-help>
      <p className="mb-1 font-semibold text-(--m3-on-surface)">Camera</p>
      <ul className="space-y-1 leading-snug text-(--m3-on-surface-variant)">
        <li className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {CAMERA_VIEWS.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 whitespace-nowrap">
              <kbd className={KEY}>{v.key}</kbd>
              {v.name}
            </span>
          ))}
        </li>
        <li>
          <kbd className={KEY}>F</kbd> frames the whole body, or the selected point&apos;s part; <kbd className={KEY}>R</kbd> resets the view.
        </li>
        <li>Drag empty space to orbit, right-drag to pan, scroll to zoom. Click an end of the axis widget (top right) to look from that side.</li>
      </ul>
    </div>
  );
}
