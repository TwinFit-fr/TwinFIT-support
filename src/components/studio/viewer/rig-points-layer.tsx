"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Move3d } from "lucide-react";
import { DRAG_SLOP_PX, isNudgeKey } from "@/lib/studio/pose-points";
import { toMm } from "@/lib/studio/rig-points";
import { useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { RigLegend } from "./rig-help";
import { rigStage, useRigPoints, type RigPointInfo } from "./rig-stage";

type Press = { id: string; pointer: number; x: number; y: number; dragging: boolean };

const ORIGIN_WORDS: Record<string, string> = { detected: "auto-detected", moved: "moved from where it was detected", manual: "added by hand" };

/** Is this key event for the stage (body, canvas, a point), not for a control that owns the key? */
function forStage(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target || target === document.body) return true;
  if (target.closest("[data-rig-point]")) return true;
  return target.tagName === "CANVAS";
}

/** The selected point's position in millimetres, as text, while it is dragged (the panel shows the same numbers). */
function useLiveNumbers(id: string | null, active: boolean): string | null {
  return useStudioStore((s) => {
    if (!active || !id) return null;
    const offset =
      s.edit.mode === "model"
        ? (s.draftPlacements[id] ?? s.equipmentModels[id]?.placement)?.offset
        : (s.draftSockets?.sockets ?? s.scene.sockets).find((socket) => socket.id === id)?.offset;
    return offset ? offset.map((v) => toMm(v).toFixed(0)).join(", ") : null;
  });
}

/**
 * The rig editor's points on the stage, drawn like the pose editor's body points and handled the
 * same way: hover names a point, a click selects it (the panel's list follows), a press and drag
 * moves it in the view (the panel's numbers follow during the drag), the arrow keys nudge the
 * selected one and Escape clears the selection. Positions come from the scene every frame and are
 * written to the DOM directly (rig-edit-scene.tsx), so a drag never re-renders React for them.
 */
export function RigPointsLayer({ statusHost = null, legendHost = null }: { statusHost?: HTMLElement | null; legendHost?: HTMLElement | null }) {
  const mode = useStudioStore((s) => s.edit.mode);
  const selected = useStudioStore((s) => s.edit.target);
  const tool = useStudioStore((s) => s.edit.tool);
  const points = useRigPoints((s) => s.points);
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const press = useRef<Press | null>(null);
  const open = mode !== "off";
  const live = useLiveNumbers(dragging, Boolean(dragging));

  useEffect(() => {
    rigStage.layer = {
      frame(frame) {
        const el = root.current;
        if (!el) return;
        el.dataset.ready = frame ? "true" : "false";
        if (!frame) return;
        for (const [id, button] of buttons.current) {
          const p = frame.points[id];
          button.style.visibility = p ? "" : "hidden";
          if (p) button.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        }
      },
      announce: setMessage,
      setDragging,
    };
    return () => {
      rigStage.layer = null;
    };
  }, []);

  // Escape and the arrow keys act on the selected point while the focus is on the stage.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !forStage(event)) return;
      const current = useStudioStore.getState().edit.target;
      if (!current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        useStudioStore.getState().setEdit({ target: null });
        setMessage("Selection cleared.");
      } else if (isNudgeKey(event.key)) {
        event.preventDefault();
        rigStage.scene?.nudge(current, event.key, event.shiftKey);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (isNudgeKey(event.key)) rigStage.scene?.endNudge();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [open]);

  // The wheel over a point still zooms the view.
  const shown = open && points.length > 0;
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

  if (!open) return null;

  const labelOf = (id: string) => points.find((p) => p.id === id)?.label ?? id;
  const select = (id: string) => {
    useStudioStore.getState().setEdit({ target: id });
    setMessage(`${labelOf(id)} selected: drag it, use the gizmo, or nudge it with the arrow keys. Escape clears.`);
  };
  const local = (event: React.PointerEvent) => {
    const box = root.current!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const onPointerDown = (id: string) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    // No text selection or focus ring on a pointer press; a field that had the focus lets go, so the arrow keys nudge next.
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body && !document.activeElement.closest("[data-rig-point]")) document.activeElement.blur();
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    if (useStudioStore.getState().edit.target !== id) useStudioStore.getState().setEdit({ target: id });
  };
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.pointer !== event.pointerId) return;
    if (!p.dragging) {
      if (Math.hypot(event.clientX - p.x, event.clientY - p.y) < DRAG_SLOP_PX) return;
      p.dragging = true;
      const box = root.current!.getBoundingClientRect();
      rigStage.scene?.beginDrag(p.id, { x: p.x - box.left, y: p.y - box.top });
    }
    rigStage.scene?.dragTo(local(event));
  };
  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.pointer !== event.pointerId) return;
    press.current = null;
    if (p.dragging) rigStage.scene?.endDrag();
    else select(p.id);
  };
  const onPointerCancel = () => {
    if (press.current?.dragging) rigStage.scene?.endDrag();
    press.current = null;
  };

  const active = dragging ?? selected;
  const activeInfo: RigPointInfo | undefined = active ? points.find((p) => p.id === active) : undefined;
  const equipment = mode === "model";
  return (
    <div ref={root} className="pose-points rig-points pointer-events-none absolute inset-0 overflow-hidden" data-ready="false">
      <div role="group" aria-label={equipment ? "Equipment placements: drag one to move it, or select one and use the arrow keys" : "Attachment points: drag one to move it, or select one and use the arrow keys"}>
        {points.map((p) => (
          <button
            key={p.id}
            type="button"
            ref={(el) => {
              if (el) buttons.current.set(p.id, el);
              else buttons.current.delete(p.id);
            }}
            data-rig-point={p.id}
            data-state={dragging === p.id ? "dragging" : selected === p.id ? "selected" : "idle"}
            data-auto={p.origin && p.origin !== "detected" ? "set" : undefined}
            aria-pressed={selected === p.id}
            aria-label={`${p.label}${p.origin ? `, ${ORIGIN_WORDS[p.origin]}` : ""}`}
            aria-describedby="rig-points-help"
            className="pose-point pointer-events-auto"
            onPointerEnter={(event) => event.currentTarget.setAttribute("data-hover", "true")}
            onPointerLeave={(event) => event.currentTarget.removeAttribute("data-hover")}
            onPointerDown={onPointerDown(p.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onClick={(event) => {
              // Pointer clicks are handled on pointer up; this is the keyboard (Enter).
              if (event.detail === 0) select(p.id);
            }}
          >
            <span className="pose-point-dot" aria-hidden="true" />
            <span className="pose-point-label" aria-hidden="true">
              {p.label}
            </span>
          </button>
        ))}
      </div>
      {statusHost
        ? createPortal(
            <div className="pose-status pointer-events-none flex w-full justify-center">
              <div className={cn("studio-glass pointer-events-auto flex max-w-full items-center gap-2 rounded-full py-1.5 pr-3 pl-3 text-[11px] text-(--m3-on-surface)", dragging && "pose-status-live")} data-rig-status>
                <Move3d className="h-3.5 w-3.5 shrink-0 text-(--m3-primary)" aria-hidden="true" />
                <span className="min-w-0 leading-snug text-pretty">
                  {activeInfo ? (
                    <>
                      <span className="font-semibold">{activeInfo.label}</span>
                      <span className="text-(--m3-on-surface-variant)">
                        {dragging ? ` · moving${live ? ` · ${live} mm` : ""}` : ` · drag it, ${tool === "rotate" ? "turn" : "move"} it with the gizmo, or nudge it with the arrows`}
                      </span>
                    </>
                  ) : (
                    <span className="text-(--m3-on-surface-variant)">{equipment ? "Click a model's point to select it, drag it to move the model" : "Click a point on the body to select it, drag it to move it"}</span>
                  )}
                </span>
              </div>
            </div>,
            statusHost,
          )
        : null}
      {legendHost ? createPortal(<RigLegend equipment={equipment} />, legendHost) : null}
      <p id="rig-points-help" className="sr-only">
        Press and drag to move it in the view. Arrow keys move the selected point by a millimetre, Page Up and Page Down in depth, Shift for ten. Escape clears the selection.
      </p>
      <div className="sr-only" role="status" aria-live="polite">
        {message}
      </div>
    </div>
  );
}
