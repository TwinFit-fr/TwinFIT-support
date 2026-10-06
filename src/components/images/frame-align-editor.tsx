"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Move } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { CHECKER_STYLE } from "@/components/images/checker";
import { frameHoldMs, gifPlaybackOrder, imageThumbUrl } from "@/lib/images/urls";
import { IDENTITY_NUDGE, isIdentityNudge, type FrameNudge } from "@/lib/images/nudge";
import {
  framePositionLabel,
  type ExerciseImage,
  type Subject,
} from "@/lib/images/types";
import { cn } from "@/lib/utils";

const SUBJECT_LABEL: Record<Subject, string> = {
  man: "Man",
  woman: "Woman",
};

const SCALE_MIN = 0.5;
const SCALE_MAX = 1.5;

type FrameAlignEditorProps = {
  open: boolean;
  subject: Subject;
  frames: ExerciseImage[];
  busy?: boolean;
  onClose: () => void;
  onSave: (adjustments: { imageId: string; dx: number; dy: number; scale: number }[]) => Promise<void>;
};

function nudgeCss(nudge: FrameNudge): string {
  return `translate(${nudge.dx * 100}%, ${nudge.dy * 100}%) scale(${nudge.scale})`;
}

function clampScale(value: number): number {
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, value));
}

export function FrameAlignEditor({
  open,
  subject,
  frames,
  busy,
  onClose,
  onSave,
}: FrameAlignEditorProps) {
  const sorted = useMemo(
    () => [...frames].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [frames],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [guideId, setGuideId] = useState<string | null>(null);
  const [nudges, setNudges] = useState<Record<string, FrameNudge>>({});
  const [mode, setMode] = useState<"align" | "play">("align");
  const [playStep, setPlayStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    kind: "move" | "scale";
    pointerId: number;
    startX: number;
    startY: number;
    originDx: number;
    originDy: number;
    originScale: number;
    width: number;
    height: number;
  } | null>(null);

  const frameKey = sorted.map((f) => f.id).join(",");
  useEffect(() => {
    if (!open) return;
    // Prefer adjusting a non-Start frame first; Start can still be selected.
    const preferred =
      sorted.find((f) => f.position !== 0)?.id ?? sorted[0]?.id ?? null;
    const guide =
      sorted.find((f) => f.id !== preferred && f.position === 0)?.id ??
      sorted.find((f) => f.id !== preferred)?.id ??
      null;
    setActiveId(preferred);
    setGuideId(guide);
    setNudges(Object.fromEntries(sorted.map((f) => [f.id, { ...IDENTITY_NUDGE }])));
    setMode("align");
    setPlayStep(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject, frameKey]);

  const active = sorted.find((f) => f.id === activeId) ?? null;
  const guide = sorted.find((f) => f.id === guideId) ?? null;
  const activeNudge = active ? (nudges[active.id] ?? IDENTITY_NUDGE) : IDENTITY_NUDGE;
  const guideNudge = guide ? (nudges[guide.id] ?? IDENTITY_NUDGE) : IDENTITY_NUDGE;
  const dirty = sorted.some((f) => !isIdentityNudge(nudges[f.id] ?? IDENTITY_NUDGE));

  const playOrder = useMemo(
    () => gifPlaybackOrder(sorted.map((f) => f.position as number)),
    [sorted],
  );

  useEffect(() => {
    if (!open || mode !== "play" || playOrder.length < 2) return;
    const timer = window.setTimeout(
      () => setPlayStep((i) => (i + 1) % playOrder.length),
      frameHoldMs(playOrder, playStep % playOrder.length),
    );
    return () => window.clearTimeout(timer);
  }, [open, mode, playOrder, playStep]);

  const currentPlayPosition = playOrder[playStep % playOrder.length];

  const setActiveNudge = useCallback(
    (patch: Partial<FrameNudge>) => {
      if (!activeId) return;
      setNudges((prev) => ({
        ...prev,
        [activeId]: { ...(prev[activeId] ?? IDENTITY_NUDGE), ...patch },
      }));
    },
    [activeId],
  );

  const selectActive = useCallback(
    (id: string) => {
      setActiveId(id);
      if (guideId === id) {
        setGuideId(sorted.find((f) => f.id !== id)?.id ?? null);
      }
    },
    [guideId, sorted],
  );

  const beginDrag = useCallback(
    (kind: "move" | "scale", event: React.PointerEvent) => {
      if (mode !== "align" || !active || busy || saving) return;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect.height) return;
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      dragRef.current = {
        kind,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originDx: activeNudge.dx,
        originDy: activeNudge.dy,
        originScale: activeNudge.scale,
        width: rect.width,
        height: rect.height,
      };
    },
    [mode, active, busy, saving, activeNudge],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !activeId) return;
      if (drag.kind === "move") {
        const dx = drag.originDx + (event.clientX - drag.startX) / drag.width;
        const dy = drag.originDy + (event.clientY - drag.startY) / drag.height;
        setNudges((prev) => ({
          ...prev,
          [activeId]: {
            ...(prev[activeId] ?? IDENTITY_NUDGE),
            dx: Math.max(-0.45, Math.min(0.45, dx)),
            dy: Math.max(-0.45, Math.min(0.45, dy)),
          },
        }));
        return;
      }
      // Scale from bottom-right: drag outward increases size.
      const delta =
        ((event.clientX - drag.startX) + (event.clientY - drag.startY)) /
        (drag.width + drag.height);
      setNudges((prev) => ({
        ...prev,
        [activeId]: {
          ...(prev[activeId] ?? IDENTITY_NUDGE),
          scale: clampScale(drag.originScale + delta * 2),
        },
      }));
    },
    [activeId],
  );

  const endDrag = useCallback((event: React.PointerEvent) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }, []);

  async function handleSave() {
    if (!dirty || saving || busy) return;
    const adjustments = sorted
      .map((f) => {
        const n = nudges[f.id] ?? IDENTITY_NUDGE;
        return { imageId: f.id, dx: n.dx, dy: n.dy, scale: n.scale };
      })
      .filter((a) => !isIdentityNudge(a));
    if (!adjustments.length) return;
    setSaving(true);
    try {
      await onSave(adjustments);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const disabled = busy || saving;

  return (
    <Modal
      onClose={onClose}
      labelledBy="frame-align-title"
      dismissible={!disabled}
      className="flex h-[min(92vh,820px)] max-w-3xl flex-col"
    >
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
        <div>
          <h2 id="frame-align-title" className="flex items-center gap-2 text-lg font-semibold">
            <Move className="h-4 w-4 text-zinc-500" />
            Align frames · {SUBJECT_LABEL[subject]}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Move and resize any frame (including Start). Ghost = reference only.
          </p>
        </div>
        <Button type="button" variant="ghost" className="h-8 px-2" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="space-y-3">
          <div
            ref={stageRef}
            className={cn(
              "relative aspect-square w-full overflow-hidden rounded-xl border border-zinc-200",
              mode === "align" && active && "cursor-grab active:cursor-grabbing",
            )}
            style={CHECKER_STYLE}
            onPointerDown={(e) => beginDrag("move", e)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {mode === "align" ? (
              <>
                {guide && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageThumbUrl(guide.image_url, 800) ?? undefined}
                    alt="Guide"
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-35"
                    style={{ transform: nudgeCss(guideNudge) }}
                    draggable={false}
                  />
                )}
                {active && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{ transform: nudgeCss(activeNudge) }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageThumbUrl(active.image_url, 800) ?? undefined}
                      alt="Adjusting"
                      className="absolute inset-0 h-full w-full object-contain"
                      draggable={false}
                    />
                    <button
                      type="button"
                      aria-label="Resize"
                      title="Drag to resize"
                      className="pointer-events-auto absolute bottom-3 right-3 z-10 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-white bg-zinc-900 shadow"
                      onPointerDown={(e) => beginDrag("scale", e)}
                      onPointerMove={onPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                  </div>
                )}
              </>
            ) : (
              sorted.map((frame) => {
                const visible = frame.position === currentPlayPosition;
                const n = nudges[frame.id] ?? IDENTITY_NUDGE;
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={frame.id}
                    src={imageThumbUrl(frame.image_url, 800) ?? undefined}
                    alt=""
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{
                      visibility: visible ? "visible" : "hidden",
                      transform: nudgeCss(n),
                    }}
                    draggable={false}
                  />
                );
              })
            )}
            <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-px text-[10px] font-medium text-white">
              {mode === "play"
                ? framePositionLabel(currentPlayPosition)
                : active
                  ? `Editing ${framePositionLabel(active.position)}`
                  : "—"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-zinc-100 p-0.5">
              {(
                [
                  ["align", "Align"],
                  ["play", "GIF preview"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={mode === id}
                  onClick={() => setMode(id)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50",
                    mode === id
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-600 hover:text-zinc-900",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "align" && (
              <span className="text-[11px] text-zinc-500">
                Drag to move · corner handle or slider to resize
              </span>
            )}
          </div>

          {mode === "align" && active && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <label className="space-y-1 text-xs text-zinc-600">
                <span className="font-medium text-zinc-800">
                  Size {Math.round(activeNudge.scale * 100)}%
                </span>
                <input
                  type="range"
                  min={SCALE_MIN}
                  max={SCALE_MAX}
                  step={0.01}
                  value={activeNudge.scale}
                  disabled={disabled}
                  onChange={(e) => setActiveNudge({ scale: Number(e.target.value) })}
                  className="w-full accent-zinc-900"
                />
              </label>
              <div className="flex items-end gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 w-8 px-0 py-0 text-xs"
                  disabled={disabled}
                  onClick={() => setActiveNudge({ scale: clampScale(activeNudge.scale - 0.02) })}
                  title="Smaller"
                >
                  −
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 w-8 px-0 py-0 text-xs"
                  disabled={disabled}
                  onClick={() => setActiveNudge({ scale: clampScale(activeNudge.scale + 0.02) })}
                  title="Larger"
                >
                  +
                </Button>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-8 py-0 text-xs"
                disabled={disabled}
                onClick={() => setActiveNudge({ ...IDENTITY_NUDGE })}
              >
                Reset
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-zinc-800">Edit frame</div>
            <div className="space-y-1">
              {sorted.map((frame) => {
                const selected = frame.id === activeId;
                const n = nudges[frame.id] ?? IDENTITY_NUDGE;
                const changed = !isIdentityNudge(n);
                return (
                  <button
                    key={frame.id}
                    type="button"
                    disabled={disabled || mode === "play"}
                    onClick={() => selectActive(frame.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition",
                      selected
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 hover:bg-zinc-50 text-zinc-700",
                    )}
                  >
                    <span
                      className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-zinc-200"
                      style={CHECKER_STYLE}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageThumbUrl(frame.image_url, 80) ?? undefined}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {framePositionLabel(frame.position)}
                      </span>
                      {changed && (
                        <span
                          className={cn(
                            "text-[10px]",
                            selected ? "text-zinc-300" : "text-amber-700",
                          )}
                        >
                          modified
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-zinc-800">Ghost reference</div>
            <div className="inline-flex w-full flex-wrap gap-1 rounded-lg bg-zinc-100 p-0.5">
              <button
                type="button"
                disabled={disabled || mode === "play"}
                aria-pressed={guideId == null}
                onClick={() => setGuideId(null)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition disabled:opacity-50",
                  guideId == null
                    ? "bg-white text-zinc-900 shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900",
                )}
              >
                None
              </button>
              {sorted
                .filter((f) => f.id !== activeId)
                .map((frame) => (
                  <button
                    key={frame.id}
                    type="button"
                    disabled={disabled || mode === "play"}
                    aria-pressed={guideId === frame.id}
                    onClick={() => setGuideId(frame.id)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition disabled:opacity-50",
                      guideId === frame.id
                        ? "bg-white text-zinc-900 shadow-xs"
                        : "text-zinc-600 hover:text-zinc-900",
                    )}
                  >
                    {framePositionLabel(frame.position)}
                  </button>
                ))}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-zinc-500">
            Save rewrites every modified frame so the Preview GIF stays aligned.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3">
        <Button type="button" variant="secondary" className="h-8 py-0" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          className="h-8 py-0"
          disabled={disabled || !dirty}
          onClick={() => void handleSave()}
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            "Save alignment"
          )}
        </Button>
      </div>
    </Modal>
  );
}
