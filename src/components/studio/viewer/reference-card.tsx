"use client";

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ImageOff, Images, Maximize2, Minimize2, Move, RotateCw } from "lucide-react";
import {
  CARD_PARTS,
  CORNER_NAME,
  DEFAULT_REFERENCE_PREFS,
  REFERENCE_STORAGE_KEY,
  cardLayout,
  cardMaxWidth,
  cardOpen,
  nearestCorner,
  nextCorner,
  parseReferencePrefs,
  shortText,
  type ReferenceCorner,
  type ReferencePrefs,
  type ReferenceSlot,
} from "@/lib/studio/exercise-reference";
import { useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { AuthImage } from "../auth-image";
import { useExerciseReference } from "../hooks/use-exercise-reference";
import { AXIS_WIDGET_PX } from "./stage-body";

/** Remembered per browser: open or not, which corner, image size. The server render (and hydration) uses the defaults. */
const prefsListeners = new Set<() => void>();
let prefsCache: ReferencePrefs | null = null;
function readPrefs(): ReferencePrefs {
  if (!prefsCache) {
    try {
      prefsCache = parseReferencePrefs(window.localStorage.getItem(REFERENCE_STORAGE_KEY));
    } catch {
      prefsCache = DEFAULT_REFERENCE_PREFS;
    }
  }
  return prefsCache;
}
function writePrefs(next: Partial<ReferencePrefs>): void {
  prefsCache = { ...readPrefs(), ...next };
  try {
    window.localStorage.setItem(REFERENCE_STORAGE_KEY, JSON.stringify(prefsCache));
  } catch {
    /* private mode: not remembered */
  }
  for (const listener of prefsListeners) listener();
}
function subscribePrefs(listener: () => void): () => void {
  prefsListeners.add(listener);
  return () => prefsListeners.delete(listener);
}
function useReferencePrefs(): [ReferencePrefs, (next: Partial<ReferencePrefs>) => void] {
  return [useSyncExternalStore(subscribePrefs, readPrefs, () => DEFAULT_REFERENCE_PREFS), writePrefs];
}

const INSET = 16;
const GAP = 8;
/** Room the closed card (the Reference button) takes. */
const CLOSED_WIDTH = 120;

/** The card's insets in its corner, the height it may use, and the stage's width (an undecided card opens on a wide stage). */
type Place = { top: number; bottom: number; left: number; right: number; maxHeight: number; stage: number };

/**
 * Where the card may sit in its corner: its column of the stage kept clear of the status cards and
 * the legend, the axis widget, the Rig editor button and the bottom bars (when they lie over the
 * 3D view). Overlays in the upper half push it down, those in the lower half push it up; the
 * height left is the card's to use. Measured again whenever the stage or those overlays resize.
 */
function useCornerPlace(card: React.RefObject<HTMLElement | null>, prefs: ReferencePrefs, shown: boolean): Place {
  const [place, setPlace] = useState<Place>({ top: INSET, bottom: INSET, left: INSET, right: INSET, maxHeight: 400, stage: 0 });
  useLayoutEffect(() => {
    const el = card.current;
    const box = el?.parentElement;
    const frame = el?.closest(".stage-frame");
    const pane = frame?.parentElement;
    if (!el || !box || !frame || !pane) return;
    const measure = () => {
      const b = box.getBoundingClientRect();
      const corner = prefs.corner;
      const width = cardOpen(prefs, b.width) ? cardMaxWidth(prefs.large) : CLOSED_WIDTH;
      const x0 = corner.endsWith("left") ? INSET : b.width - INSET - width;
      const x1 = x0 + width;
      const rects = [...pane.querySelectorAll<HTMLElement>(".stage-hud > *, .studio-glass")]
        .filter((o) => !o.closest("[data-reference-card], .pose-points, .body-marks"))
        .map((o) => o.getBoundingClientRect())
        .filter((r) => r.width > 1 && r.height > 1)
        .map((r) => ({ left: r.left - b.left, right: r.right - b.left, top: r.top - b.top, bottom: r.bottom - b.top }));
      // The axis widget, top right.
      rects.push({ left: b.width - AXIS_WIDGET_PX, right: b.width, top: 0, bottom: AXIS_WIDGET_PX });
      let top = INSET;
      let bottom = INSET;
      for (const r of rects) {
        if (r.right <= x0 - GAP || r.left >= x1 + GAP || r.bottom <= 0 || r.top >= b.height) continue;
        if ((r.top + r.bottom) / 2 < b.height / 2) top = Math.max(top, r.bottom + GAP);
        else bottom = Math.max(bottom, b.height - r.top + GAP);
      }
      const next = { top, bottom, left: INSET, right: INSET, maxHeight: Math.max(0, b.height - top - bottom), stage: Math.round(b.width) };
      setPlace((p) => (p.top === next.top && p.bottom === next.bottom && p.maxHeight === next.maxHeight && p.stage === next.stage ? p : next));
    };
    measure();
    // The status cards and the bars grow and shrink as their content changes: their size is enough to watch.
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    for (const o of pane.querySelectorAll(".stage-hud, .stage-bars, .studio-glass")) if (!o.closest("[data-reference-card]")) observer.observe(o);
    return () => observer.disconnect();
  }, [card, prefs, shown]);
  return place;
}

function cornerStyle(corner: ReferenceCorner, place: Place, maxHeight = true): React.CSSProperties {
  return {
    ...(corner.startsWith("top") ? { top: place.top } : { bottom: place.bottom }),
    ...(corner.endsWith("left") ? { left: place.left } : { right: place.right }),
    ...(maxHeight ? { maxHeight: place.maxHeight } : {}),
  };
}

function Frame({ slot, exercise, large, full, caption }: { slot: ReferenceSlot; exercise: string; large: boolean; full: boolean; caption: boolean }) {
  return (
    <figure className="min-w-0" data-reference-slot={slot.label.toLowerCase()}>
      <div className="reference-tile relative aspect-square overflow-hidden rounded-xl">
        {slot.image ? (
          <AuthImage
            src={slot.image}
            alt={`${exercise}, ${slot.label.toLowerCase()} position (catalog reference)`}
            className="object-contain"
            fallback={
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-[10px] leading-snug text-[#3a4252]" data-reference-unavailable>
                <ImageOff className="h-4 w-4" aria-hidden="true" />
                Image could not be loaded
              </div>
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] leading-snug text-[#3a4252]">No image</div>
        )}
        <span className="absolute top-1.5 left-1.5 rounded-full bg-[#0b0e14]/80 px-1.5 py-px text-[10px] font-semibold tracking-wide text-[#e3e7f0]">{slot.label}</span>
      </div>
      {slot.text && (caption || full) ? (
        <figcaption className={cn("mt-1.5 px-0.5 leading-snug text-(--m3-on-surface-variant)", large ? "text-[11px]" : "text-[10.5px]", !full && "line-clamp-3")} title={full ? undefined : slot.text}>
          {full ? slot.text : shortText(slot.text)}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * The exercise's catalog reference on the stage: its start and end position frames (the frames
 * the AI draft reads) and position texts, to compare the pose with the real movement without
 * leaving the stage. Collapsible, remembered, movable to any corner (drag the title bar, or Move).
 * It sits under the body points, and only its controls take presses: a body point over it is
 * always grabbed, and a press on an image orbits the camera like the stage around it.
 */
export function ReferenceCard() {
  const exerciseId = useStudioStore((s) => s.exerciseId);
  const rigEditing = useStudioStore((s) => s.edit.mode !== "off");
  const [prefs, setPrefs] = useReferencePrefs();
  const [full, setFull] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const place = useCornerPlace(root, prefs, Boolean(exerciseId && !rigEditing));
  const open = cardOpen(prefs, place.stage);
  const { exercise, reference, loading, error, retry } = useExerciseReference();
  const drag = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null);

  // A new exercise starts with the short texts.
  const [shownFor, setShownFor] = useState(exerciseId);
  if (shownFor !== exerciseId) {
    setShownFor(exerciseId);
    setFull(false);
  }

  if (!exerciseId || rigEditing) return null;
  const name = exercise?.display_name ?? "This exercise";
  const next = nextCorner(prefs.corner);
  const slots = [reference?.start, reference?.end].filter((s): s is ReferenceSlot => Boolean(s));
  const hasText = slots.some((s) => s.text);
  // The frames as large as chosen while they fit the corner's height (a short stage drops the subtitle, then the captions).
  const layout = cardLayout(place.maxHeight, prefs.large, hasText);
  const width = reference && !reference.hasImages ? cardMaxWidth(prefs.large) : slots.length === 1 ? layout.tile + 2 * CARD_PARTS.side : layout.width;

  // Drag the title bar: the card follows the pointer and lands in the nearest corner.
  const onHeaderDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };
  const onHeaderMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId || !root.current) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    root.current.style.transform = `translate(${dx}px, ${dy}px)`;
    root.current.dataset.dragging = "true";
  };
  const onHeaderUp = (event: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    const el = root.current;
    if (!d || !el || d.pointer !== event.pointerId) return;
    if (d.moved && el.parentElement) {
      const r = el.getBoundingClientRect();
      const b = el.parentElement.getBoundingClientRect();
      setPrefs({ corner: nearestCorner(r.left + r.width / 2 - b.left, r.top + r.height / 2 - b.top, b.width, b.height) });
    }
    el.style.transform = "";
    delete el.dataset.dragging;
  };

  if (!open) {
    return (
      <div ref={root} className="pointer-events-none absolute" style={cornerStyle(prefs.corner, place, false)} data-stage-obstacle data-reference-card="closed">
        <button
          ref={toggle}
          type="button"
          aria-expanded={false}
          onClick={() => setPrefs({ open: true })}
          title="Show the exercise's catalog reference: start and end positions"
          className="studio-glass studio-state pointer-events-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full pr-3 pl-2.5 text-[11px] font-medium text-(--m3-on-surface) shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
        >
          <Images className="h-3.5 w-3.5 text-(--m3-primary)" aria-hidden="true" />
          Reference
        </button>
      </div>
    );
  }

  const iconButton = "studio-state pointer-events-auto inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--m3-on-surface-variant) outline-none hover:text-(--m3-on-surface) focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70";
  return (
    <section
      ref={root}
      aria-labelledby={titleId}
      className="reference-card studio-glass pointer-events-none absolute flex flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{ ...cornerStyle(prefs.corner, place), width }}
      data-stage-obstacle
      data-reference-card="open"
      data-corner={prefs.corner}
    >
      <div
        className="pointer-events-auto flex shrink-0 cursor-grab touch-none items-center gap-0.5 py-1.5 pr-1.5 pl-2.5 select-none active:cursor-grabbing"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        onPointerCancel={onHeaderUp}
        title="Drag to another corner"
      >
        <Images className="h-3.5 w-3.5 shrink-0 text-(--m3-primary)" aria-hidden="true" />
        <h2 id={titleId} className="ml-1 min-w-0 flex-1 truncate text-[11px] font-semibold tracking-[0.1em] text-(--m3-on-surface) uppercase">
          Reference
        </h2>
        <button type="button" className={iconButton} onClick={() => setPrefs({ large: !prefs.large })} aria-label={prefs.large ? "Smaller images" : "Larger images"} title={prefs.large ? "Smaller images" : "Larger images"}>
          {prefs.large ? <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
        <button type="button" className={iconButton} onClick={() => setPrefs({ corner: next })} aria-label={`Move to the ${CORNER_NAME[next]} corner`} title={`Move to the ${CORNER_NAME[next]} corner (or drag the title)`}>
          <Move className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={iconButton}
          aria-expanded
          onClick={() => {
            setPrefs({ open: false });
            requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>("button")?.focus());
          }}
          aria-label="Hide the reference"
          title="Hide the reference"
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {layout.subtitle || full ? (
        <p className={cn("-mt-1 shrink-0 px-3 pb-1.5 text-[10.5px] leading-snug text-(--m3-on-surface-variant)", !full && "line-clamp-2")} title={`${name}: the catalog positions the AI draft reads`}>
          {name}: the catalog positions the AI draft reads
        </p>
      ) : (
        <p className="sr-only">{name}: the catalog positions the AI draft reads</p>
      )}
      {/* The whole texts scroll (and take the wheel and the keyboard); otherwise the card is sized to fit. */}
      <div
        className={cn("min-h-0 px-2 pb-2", full ? "studio-scroll pointer-events-auto overflow-y-auto rounded-b-2xl outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70" : "overflow-hidden")}
        tabIndex={full ? 0 : undefined}
        role={full ? "region" : undefined}
        aria-label={full ? "Position texts" : undefined}
      >
        {loading ? (
          <div className="grid grid-cols-2 gap-2" aria-busy="true" aria-label="Loading the reference">
            <div className="aspect-square animate-pulse rounded-xl bg-(--m3-surface-container-highest)" />
            <div className="aspect-square animate-pulse rounded-xl bg-(--m3-surface-container-highest)" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-(--m3-surface-container-highest) px-3 py-2 text-[11px] text-(--m3-on-surface)">
            Could not load the reference.
            <button type="button" onClick={retry} className="studio-state pointer-events-auto inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 font-medium text-(--m3-primary) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70">
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </button>
          </div>
        ) : !slots.length ? (
          <p className="rounded-xl bg-(--m3-surface-container-highest) px-3 py-2 text-[11px] leading-snug text-(--m3-on-surface)" data-reference-empty>
            No reference for this exercise yet: the catalog has no position images or texts for it. They are made in the Images tool.
          </p>
        ) : (
          <>
            {!reference?.hasImages ? (
              <>
                <p className="mb-2 rounded-xl bg-(--m3-surface-container-highest) px-3 py-2 text-[11px] leading-snug text-(--m3-on-surface)" data-reference-empty>
                  No reference images for this exercise yet. They are made in the Images tool; the AI draft reads only the texts below.
                </p>
                <dl className="space-y-1.5 px-1 text-[11px] leading-snug" data-reference-texts>
                  {slots.map((slot) => (
                    <div key={slot.label} data-reference-slot={slot.label.toLowerCase()}>
                      <dt className="font-semibold text-(--m3-on-surface)">{slot.label}</dt>
                      <dd className={cn("text-(--m3-on-surface-variant)", !full && "line-clamp-3")} title={full ? undefined : (slot.text ?? undefined)}>
                        {slot.text ? (full ? slot.text : shortText(slot.text)) : "No text."}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <div className={cn("grid gap-2", slots.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                {slots.map((slot) => (
                  <Frame key={slot.label} slot={slot} exercise={name} large={prefs.large} full={full} caption={layout.captions} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {hasText && !loading && !error ? (
        <div className="shrink-0 border-t border-(--m3-outline-variant) px-1.5 py-1">
          <button
            type="button"
            aria-expanded={full}
            onClick={() => setFull((v) => !v)}
            className="studio-state pointer-events-auto inline-flex h-7 cursor-pointer items-center rounded-full px-2 text-[11px] font-medium text-(--m3-primary) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
          >
            {full ? "Short texts" : "Full position texts"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
