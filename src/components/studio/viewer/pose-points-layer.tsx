"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Hand, Link2, Unlink2 } from "lucide-react";
import { useDragMode, useDragModeStore } from "@/lib/studio/drag-mode";
import { HIT_MAX_PX, dotScale, hitSize, neighbourGaps, pickPoint, type ScreenPoints } from "@/lib/studio/pose-hit";
import { movesAlone } from "@/lib/studio/pose-legs";
import { replacesNote } from "@/lib/studio/rebuild-words";
import { DRAG_SLOP_PX, POINT_HINT, POINT_LABEL, isNudgeKey, isPointId, mirrorPoint, pointRole, type PointId } from "@/lib/studio/pose-points";
import { pointName } from "@/lib/studio/point-state";
import { useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { usePointMarks } from "../hooks/use-point-marks";
import { useRebuildNotice } from "../hooks/use-template-settings";
import { giveBackPoint, togglePointPin } from "../point-actions";
import { StageGuardConfirm } from "../rebuild-guard";
import { DragModeControl, ExerciseBadge, ExerciseLine } from "./exercise-status";
import { PointLegend } from "./point-legend";
import { poseStage, type ExerciseStatus, type StageFrame } from "./pose-stage";

type Press = { id: PointId; pointer: number; x: number; y: number; dragging: boolean };
type Latest = { points: ScreenPoints; hit: Partial<Record<PointId, number>> };
type ClientXY = { clientX: number; clientY: number };

function localTo(el: HTMLElement, event: ClientXY) {
  const box = el.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

/** The point a press here means: the nearest centre whose hit circle holds the pointer. */
function pickIn(el: HTMLElement, latest: Latest, event: ClientXY): PointId | null {
  return pickPoint(latest.points, localTo(el, event), (id) => (latest.hit[id] ?? HIT_MAX_PX) / 2);
}

/** Is this key event for the stage (body, canvas, a point), not for a control that owns the key? */
function forStage(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target || target === document.body) return true;
  if (target.closest("[data-pose-point]")) return true;
  return target.tagName === "CANVAS";
}

/**
 * The body points of the pose editor, drawn over the 3D stage as real buttons: a stick figure
 * joining them, a name on hover, idle / hover / dragging / selected states. Press a point and drag
 * to move it (no select step, the camera does not orbit); click selects; Escape or a click on
 * empty space deselects; arrow keys nudge the selected point. Positions come from the scene every
 * frame and are written to the DOM directly, so a drag never re-renders React. Where hit areas
 * overlap (a hand by the head, a far-away body) the nearest point wins (pose-hit.ts), and crowded
 * dots shrink so they stay apart. A dragged point the body cannot bring under the pointer (a
 * straight arm, a thigh that cannot get shorter) stays on the body, and a dashed line shows how far
 * the pointer is.
 */
export function PosePointsLayer({ statusHost = null, legendHost = null }: { statusHost?: HTMLElement | null; legendHost?: HTMLElement | null }) {
  const editorOpen = useStudioStore((s) => Boolean(s.poseEdit) && s.edit.mode === "off");
  const selected = useStudioStore((s) => (s.poseEdit && isPointId(s.poseEdit.dragTarget) ? s.poseEdit.dragTarget : null));
  const mirror = useStudioStore((s) => s.poseEdit?.mirror ?? false);
  const [available, setAvailable] = useState<PointId[]>(() => poseStage.available);
  const [dragging, setDragging] = useState<PointId | null>(null);
  /** What the scene says about how the dragged point moves (a standing body's legs). */
  const [note, setNote] = useState<{ text: string; moves: boolean } | null>(null);
  /** The dragged point is as far as the body lets it go. */
  const [short, setShort] = useState(false);
  const [message, setMessage] = useState("");
  /** Exercise mode: what the drag is doing, and what the last one applied (shown for a moment). */
  // Kept with the exercise it was about: a message about another exercise's point is not shown.
  const [exState, setExState] = useState<{ status: ExerciseStatus | null; exercise: unknown }>({ status: null, exercise: null });
  const setExStatus = (update: (prev: ExerciseStatus | null) => ExerciseStatus | null) =>
    setExState((prev) => ({ status: update(prev.status), exercise: useDragModeStore.getState().exercise }));
  const [done, setDone] = useState<{ text: string; at: number } | null>(null);
  /** Exercise mode was picked on a locked saved clip: the clip it asks about, until the user answers. */
  const [asking, setAsking] = useState<string | null>(null);
  const dragMode = useDragMode();
  const marks = usePointMarks();
  const exStatus = exState.exercise === dragMode.exercise ? exState.status : null;
  const notice = useRebuildNotice();
  const noticeRef = useRef(notice);
  useEffect(() => {
    noticeRef.current = notice;
  });
  const badge = useRef<HTMLDivElement>(null);
  const draggingNow = useRef<PointId | null>(null);
  // A standing body moves one leg at a time: Mirror does not copy such a drag.
  const alone = useStudioStore((s) => {
    const pose = s.poseEdit?.poses[s.poseEdit.keyframe];
    const id = s.poseEdit?.dragTarget;
    return Boolean(pose && isPointId(id) && movesAlone(pose, id));
  });
  const root = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<PointId, HTMLButtonElement>());
  const halo = useRef<SVGPathElement>(null);
  const line = useRef<SVGPathElement>(null);
  const band = useRef<SVGGElement>(null);
  const shortNow = useRef(false);
  const press = useRef<Press | null>(null);
  /** Latest screen positions and hit diameters, for picking the point under the pointer. */
  const latest = useRef<Latest>({ points: {}, hit: {} });
  const hovered = useRef<PointId | null>(null);
  const linkRing = useRef<HTMLDivElement>(null);

  // The scene draws through these: positions every frame, the rest on change.
  useEffect(() => {
    poseStage.layer = {
      frame(frame: StageFrame | null) {
        const el = root.current;
        if (!el) return;
        el.dataset.ready = frame ? "true" : "false";
        if (!frame) return;
        const gaps = neighbourGaps(frame.points);
        const hit: Partial<Record<PointId, number>> = {};
        for (const [id, button] of buttons.current) {
          const p = frame.points[id];
          button.style.visibility = p ? "" : "hidden";
          if (!p) continue;
          button.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
          // Crowded points: the hit circle as large as fits (24 px at least), the dot smaller.
          const size = hitSize(gaps[id] ?? Infinity);
          const scale = String(dotScale(gaps[id] ?? Infinity));
          hit[id] = size;
          if (button.dataset.hit !== String(size)) {
            button.dataset.hit = String(size);
            button.style.setProperty("--pose-hit", `${size}px`);
          }
          if (button.dataset.dot !== scale) {
            button.dataset.dot = scale;
            button.style.setProperty("--pose-dot", scale);
          }
        }
        latest.current = { points: frame.points, hit };
        // The joint a properties control turns, while that control is hovered or focused.
        const ring = linkRing.current;
        if (ring) {
          const link = poseStage.link;
          const at = link ? link.bones.map((bone) => frame.joints[bone]).filter((p): p is { x: number; y: number } => Boolean(p)) : [];
          if (link && at.length) {
            const x = at.reduce((sum, p) => sum + p.x, 0) / at.length;
            const y = at.reduce((sum, p) => sum + p.y, 0) / at.length;
            ring.style.display = "";
            ring.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
            // The name goes on the side of the joint with room for it.
            const flip = x > el.clientWidth - 200 ? "true" : "false";
            if (ring.dataset.flip !== flip) ring.dataset.flip = flip;
            const tag = ring.lastElementChild as HTMLElement | null;
            if (tag && tag.textContent !== link.label) tag.textContent = link.label;
          } else if (ring.style.display !== "none") ring.style.display = "none";
        }
        // The setting badge rides next to the dragged point.
        const tag = badge.current;
        const at = draggingNow.current ? frame.points[draggingNow.current] : undefined;
        if (tag && at) {
          const x = Math.min(Math.max(8, at.x + 22), el.clientWidth - tag.offsetWidth - 8);
          const y = Math.min(Math.max(8, at.y - tag.offsetHeight - 14), el.clientHeight - tag.offsetHeight - 8);
          tag.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        }
        const d = frame.chains.map((c) => `M${c.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}`).join("");
        halo.current?.setAttribute("d", d);
        line.current?.setAttribute("d", d);
        const g = band.current;
        if (g) {
          g.style.display = frame.short ? "" : "none";
          if (frame.short) {
            const { from, to } = frame.short;
            for (const path of g.querySelectorAll("line")) {
              path.setAttribute("x1", from.x.toFixed(1));
              path.setAttribute("y1", from.y.toFixed(1));
              path.setAttribute("x2", to.x.toFixed(1));
              path.setAttribute("y2", to.y.toFixed(1));
            }
            g.querySelector("circle")?.setAttribute("transform", `translate(${to.x.toFixed(1)} ${to.y.toFixed(1)})`);
          }
        }
        if (shortNow.current !== Boolean(frame.short)) {
          shortNow.current = Boolean(frame.short);
          setShort(shortNow.current);
        }
      },
      setAvailable,
      announce: setMessage,
      setDragging(id, about = null) {
        draggingNow.current = id;
        setDragging(id);
        setNote(id ? about : null);
        if (id && about) setMessage(`${POINT_LABEL[id]}: ${about.text}.`);
      },
      exercise(next) {
        setExStatus((prev) => {
          if (next?.kind === "live" && next.value && (prev?.kind !== "live" || prev.value !== next.value || prev.setting !== next.setting)) setMessage(`${next.setting}: ${next.value.toLowerCase()}.`);
          if (next?.kind === "none") setMessage(`No exercise setting moves the ${next.label.toLowerCase()}. Switch to Limb to move it by hand.`);
          return next;
        });
        if (next) setDone(null);
      },
      exerciseDone({ result, setting, value }) {
        if (!result?.changed) return;
        const text = result.change ?? `${setting}: ${value?.toLowerCase()}`;
        setDone({ text, at: Date.now() });
        setMessage(`${text}. Every pose rebuilt.${result.kept ? ` ${result.kept}` : ""} Undo with Ctrl+Z.`);
        noticeRef.current(result);
      },
    };
    return () => {
      poseStage.layer = null;
    };
  }, []);

  // Escape and the arrow keys act on the selected point while the focus is on the stage.
  useEffect(() => {
    if (!editorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !forStage(event)) return;
      const current = useStudioStore.getState().poseEdit?.dragTarget;
      if (!isPointId(current)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        useStudioStore.getState().setPoseDragTarget(null);
        setMessage("Selection cleared.");
      } else if (!event.shiftKey && event.key.toLowerCase() === "a") {
        // Back to automatic: the counterpart of releasing a point the user had set.
        event.preventDefault();
        setMessage(giveBackPoint(current));
      } else if (!event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setMessage(togglePointPin(current));
      } else if (isNudgeKey(event.key)) {
        event.preventDefault();
        poseStage.scene?.nudge(current, event.key, event.shiftKey);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (isNudgeKey(event.key)) poseStage.scene?.endNudge();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [editorOpen]);

  // Hover: the point nearest the pointer among those whose hit circle it is in (not simply the
  // button drawn on top), so the highlight and the name always match what a press would grab.
  useEffect(() => {
    if (!editorOpen) return;
    const setHover = (id: PointId | null) => {
      if (hovered.current === id) return;
      if (hovered.current) buttons.current.get(hovered.current)?.removeAttribute("data-hover");
      hovered.current = id;
      if (id) buttons.current.get(id)?.setAttribute("data-hover", "true");
    };
    const onMove = (event: PointerEvent) => {
      const el = root.current;
      if (!el || press.current?.dragging) return;
      const over = event.target instanceof Element && event.target.closest("[data-pose-point]");
      setHover(over ? pickIn(el, latest.current, event) : null);
    };
    const onLeave = () => setHover(null);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      setHover(null);
    };
  }, [editorOpen]);

  // The wheel over a point still zooms the view.
  const shown = editorOpen && available.length > 0;
  useEffect(() => {
    const el = root.current;
    if (!shown || !el) return;
    const onWheel = (event: WheelEvent) => {
      const canvas = el.parentElement?.querySelector("canvas");
      if (!canvas) return;
      event.preventDefault();
      canvas.dispatchEvent(new WheelEvent("wheel", event));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [shown]);

  const select = (id: PointId) => {
    useStudioStore.getState().setPoseDragTarget(id);
    setMessage(`${POINT_LABEL[id]} selected: drag it, or move it with the arrow keys (Shift for bigger steps). Escape clears.`);
  };

  const local = (event: React.PointerEvent) => localTo(root.current!, event);
  const pick = (event: React.PointerEvent) => pickIn(root.current!, latest.current, event);

  const onPointerDown = (own: PointId) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const id = pick(event) ?? own;
    // No text selection and no focus ring on a pointer press; a slider that had the focus lets go,
    // so the arrow keys move the point next and Space plays.
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body && !document.activeElement.closest("[data-pose-point]")) document.activeElement.blur();
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    if (useStudioStore.getState().poseEdit?.dragTarget !== id) useStudioStore.getState().setPoseDragTarget(id);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.pointer !== event.pointerId) return;
    if (!p.dragging) {
      if (Math.hypot(event.clientX - p.x, event.clientY - p.y) < DRAG_SLOP_PX) return;
      p.dragging = true;
      const box = root.current!.getBoundingClientRect();
      poseStage.scene?.beginDrag(p.id, { x: p.x - box.left, y: p.y - box.top });
    }
    poseStage.scene?.dragTo(local(event));
  };
  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.pointer !== event.pointerId) return;
    press.current = null;
    if (p.dragging) poseStage.scene?.endDrag();
    else select(p.id);
  };
  const onPointerCancel = () => {
    if (press.current?.dragging) poseStage.scene?.endDrag();
    press.current = null;
  };

  // Reaching the limit during a drag is said once (the stage marks it with a dashed red ring).
  const limitNow = Boolean(dragging && (short || (note !== null && !note.moves)));
  useEffect(() => {
    if (limitNow && draggingNow.current) setMessage(`${POINT_LABEL[draggingNow.current]}: at its limit.`);
  }, [limitNow]);

  // What the last Exercise-mode drag applied stays on the status line for a few seconds.
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(null), 5000);
    return () => window.clearTimeout(id);
  }, [done]);

  if (!shown) return null;
  const exerciseMode = dragMode.mode === "exercise";
  const guard = dragMode.guard;
  const choose = (mode: "exercise" | "limb") => {
    if (mode === "exercise" && guard.locked) {
      setAsking(guard.vectorId);
      return;
    }
    setAsking(null);
    dragMode.setChoice(mode);
    setExStatus(() => null);
    setMessage(mode === "exercise" ? "Exercise mode: a drag changes the exercise settings and every pose follows." : "Limb mode: a drag moves only that limb.");
  };
  const active = dragging ?? selected;
  const other = active && !alone ? mirrorPoint(active) : null;
  const stuck = note !== null && !note.moves;
  // The dragged point is as far as it goes: the limb cannot reach the pointer, or the setting has no further choice.
  const atLimit = Boolean(dragging && (short || stuck || (exerciseMode && exStatus?.kind === "live" && exStatus.limit)));
  const moving = [stuck ? null : "moving", mirror && other ? `${POINT_LABEL[other].toLowerCase()} follows` : null, note?.text, short && !stuck ? "as far as it goes" : null].filter(Boolean).join(" · ");
  return (
    <div ref={root} className="pose-points pointer-events-none absolute inset-0 overflow-hidden" data-ready="false">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path ref={halo} className="pose-skeleton-halo" />
        <path ref={line} className="pose-skeleton-line" />
        <g ref={band} className="pose-short" style={{ display: "none" }}>
          <line className="pose-short-halo" />
          <line className="pose-short-line" />
          <circle r="4" />
        </g>
      </svg>
      <div role="group" aria-label="Body points: drag one to pose the body, or select one and use the arrow keys">
        {available.map((id) => (
          <button
            key={id}
            type="button"
            ref={(el) => {
              if (el) buttons.current.set(id, el);
              else buttons.current.delete(id);
            }}
            data-pose-point={id}
            data-role={pointRole(id)}
            data-state={dragging === id ? "dragging" : selected === id ? "selected" : "idle"}
            data-auto={marks.states ? marks.states[id] : undefined}
            data-pinned={marks.pinned.includes(id) ? "true" : undefined}
            data-limit={atLimit && dragging === id ? "" : undefined}
            aria-pressed={selected === id}
            aria-label={pointName(id, { state: marks.states?.[id] ?? null, pinned: marks.pinned.includes(id), hint: POINT_HINT[id] })}
            aria-describedby="pose-points-help"
            className="pose-point pointer-events-auto"
            onPointerDown={onPointerDown(id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onClick={(event) => {
              // Pointer clicks are handled on pointer up; this is the keyboard (Enter).
              if (event.detail === 0) select(id);
            }}
          >
            {marks.pinned.includes(id) ? <span className="pose-point-pin" aria-hidden="true" /> : null}
            <span className="pose-point-dot" aria-hidden="true" />
            <span className="pose-point-label" aria-hidden="true">
              {POINT_LABEL[id]}
            </span>
          </button>
        ))}
      </div>
      {/* What is being edited and how Mirror applies: in the stage's bottom bars, above the view toolbar. */}
      {statusHost ? createPortal(
<div className="pose-status pointer-events-none flex w-full justify-center">
        <div
          className={cn("studio-glass pointer-events-auto flex max-w-full items-center gap-2 rounded-full py-1 pr-1 text-[11px] text-(--m3-on-surface)", dragMode.draggable ? "pl-1" : "pl-3", dragging && "pose-status-live")}
          data-pose-status
        >
          {dragMode.draggable ? <DragModeControl mode={dragMode.mode} onChange={choose} /> : null}
          {guard.locked && asking === guard.vectorId ? (
            <StageGuardConfirm
              guard={guard}
              onCancel={() => setAsking(null)}
              onAllow={() => {
                dragMode.agree(guard.vectorId);
                setAsking(null);
                dragMode.setChoice("exercise");
                setMessage("Exercise mode: a drag changes the exercise settings and rebuilds every pose of this clip.");
              }}
            />
          ) : exerciseMode ? (
            <ExerciseLine status={exStatus} done={done?.text ?? null} selected={selected} replaces={replacesNote(dragMode.replaced)} onLimb={() => choose("limb")} />
          ) : (
            <>
              <Hand className="h-3.5 w-3.5 shrink-0 text-(--m3-tertiary)" aria-hidden="true" />
              <span className="min-w-0 py-0.5 leading-snug text-pretty">
                {active ? (
                  <>
                    <span className="font-semibold">{POINT_LABEL[active]}</span>
                    <span className="text-(--m3-on-surface-variant)">{dragging ? ` · ${moving}` : " · drag it, arrows nudge, Esc clears"}</span>
                  </>
                ) : (
                  <span className="text-(--m3-on-surface-variant)">Drag any point on the body to pose it</span>
                )}
              </span>
              <button
                type="button"
                aria-pressed={mirror}
                title={mirror ? "Mirror on: a change on one side is copied to the other (a standing body still moves one leg at a time). Click to turn off." : "Mirror off: only the side you touch changes. Click to turn on."}
                onClick={() => {
                  const next = !useStudioStore.getState().poseEdit?.mirror;
                  useStudioStore.getState().setPoseEditOptions({ mirror: next });
                  setMessage(next ? "Mirror on: both sides move together." : "Mirror off: only the side you touch moves.");
                }}
                className={cn(
                  "studio-state inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70",
                  mirror ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "text-(--m3-on-surface-variant)",
                )}
              >
                {mirror ? <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Unlink2 className="h-3.5 w-3.5" aria-hidden="true" />}
                Mirror {mirror ? "on" : "off"}
              </button>
            </>
          )}
        </div>
      </div>
      , statusHost) : null}
      {/* What the marks on the points mean: top left of the stage, under the status cards. */}
      {legendHost ? createPortal(<PointLegend marks={marks} limit={atLimit} />, legendHost) : null}
      <div ref={linkRing} className="pose-link" style={{ display: "none" }} aria-hidden="true" data-pose-link>
        <span className="pose-link-ring" />
        <span className="pose-link-label" />
      </div>
      <ExerciseBadge ref={badge} status={exerciseMode ? exStatus : null} />
      <p id="pose-points-help" className="sr-only">
        Press and drag to move it. Arrow keys move the selected point in the view plane, Page Up and Page Down in depth, Shift for bigger steps. A gives the selected point back to automatic, P pins or unpins it. Escape clears the selection.
      </p>
      <div className="sr-only" role="status" aria-live="polite">
        {message}
      </div>
    </div>
  );
}
