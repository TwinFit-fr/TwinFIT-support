"use client";

import { useEffect, useRef, useState } from "react";
import { balanceAt, issuesAt, type BodyIssue } from "@/lib/studio/body-issues";
import { stageTime } from "@/lib/studio/playback";
import { clearOf, type Box } from "@/lib/studio/badge-place";
import { useStudioStore } from "@/lib/studio/store";
import { keyTolerance } from "@/lib/studio/timeline";
import { focusIssue } from "../body-check-actions";
import { IssueGlyph } from "../issue-glyph";
import { poseStage, type ScreenXY, type StageFrame } from "./pose-stage";

/** Badge offset from the joint it marks (px), so the body point under it stays visible and grabbable. */
const BADGE_DX = 15;
const BADGE_DY = -30;
/** Room between badges in a row. */
const SLOT_PX = 30;
/** Joints closer than this (px) share one row of badges. */
const CLUSTER_PX = 40;
/** Room kept between a badge and the stage's own controls (px). */
const KEEP_PX = 6;
/** How often the stage's controls are measured again (ms): they move only when the stage or their text changes. */
const KEEP_OUT_MS = 300;

/** The stage's own controls over the canvas (the drag hint, the view toolbar, the status cards, the gizmo button), relative to `el`. */
function measureKeepOut(el: HTMLElement): Box[] {
  const stage = el.closest(".stage-frame");
  if (!stage) return [];
  const origin = el.getBoundingClientRect();
  const boxes: Box[] = [];
  for (const node of stage.querySelectorAll<HTMLElement>(".studio-glass")) {
    if (el.contains(node)) continue;
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    boxes.push({ left: r.left - origin.left - KEEP_PX, top: r.top - origin.top - KEEP_PX, right: r.right - origin.left + KEEP_PX, bottom: r.bottom - origin.top + KEEP_PX });
  }
  return boxes;
}


type Floor = { area: ScreenXY[]; com: ScreenXY; top: ScreenXY | null };

/** The base of support and the centre of mass of a balance problem at time `t`, on the screen. */
function floorAt(issue: BodyIssue, t: number, frame: StageFrame): Floor | null {
  const spot = balanceAt(issue, t);
  const project = frame.project;
  if (!spot || !project) return null;
  const corners: [number, number][] = [
    [spot.right, spot.heel],
    [spot.left, spot.heel],
    [spot.left, spot.toes],
    [spot.right, spot.toes],
  ];
  const area = corners.map(([x, z]) => project(x, 0.003, z));
  const com = project(spot.com[0], 0.003, spot.com[2]);
  if (!com || area.some((p) => !p)) return null;
  return { area: area as ScreenXY[], com, top: project(spot.com[0], spot.com[1], spot.com[2]) };
}

/**
 * Where the body checks fail, drawn on the body over the 3D stage: a ring on the joint concerned
 * (the foot that slides or sinks, the joint out of range, what goes through the floor) with a
 * warning badge beside it, and for balance the floor area the feet support with the centre of mass
 * dropped onto it. Only the problems happening at the playhead are shown; a badge names the
 * problem on hover or focus and, chosen, selects the body point that fixes it. Positions come from
 * the scene every frame and are written to the DOM directly; React renders only when the set of
 * problems on screen changes. Sits over the body points without covering them.
 */
export function BodyCheckMarks() {
  const editorOpen = useStudioStore((s) => Boolean(s.poseEdit) && s.edit.mode === "off");
  const report = useStudioStore((s) => s.bodyReport);
  const pending = useStudioStore((s) => s.poseChecksPending);
  const [shown, setShown] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const reportRef = useRef(report);
  const shownKey = useRef("");
  const root = useRef<HTMLDivElement>(null);
  const marks = useRef(new Map<string, HTMLLIElement>());
  const area = useRef<SVGPolygonElement>(null);
  const plumb = useRef<SVGLineElement>(null);
  const com = useRef<SVGGElement>(null);
  const comTop = useRef<SVGCircleElement>(null);

  useEffect(() => {
    reportRef.current = report;
  });

  useEffect(() => {
    let floorShown = false;
    const hideFloor = () => {
      if (!floorShown) return;
      floorShown = false;
      area.current?.setAttribute("points", "");
      if (plumb.current) plumb.current.style.display = "none";
      if (com.current) com.current.style.display = "none";
      if (comTop.current) comTop.current.style.display = "none";
    };
    let keepOut: Box[] = [];
    let measured = 0;
    poseStage.marks = {
      frame(frame) {
        const el = root.current;
        if (!el) return;
        // Read the controls' boxes before any write of this frame, a few times a second only.
        const now0 = performance.now();
        if (now0 - measured > KEEP_OUT_MS) {
          measured = now0;
          keepOut = measureKeepOut(el);
        }
        if (!frame) {
          if (el.dataset.ready !== "false") el.dataset.ready = "false";
          return;
        }
        if (el.dataset.ready !== "true") el.dataset.ready = "true";
        const s = useStudioStore.getState();
        const t = stageTime(s);
        const now = issuesAt(reportRef.current, t, keyTolerance(s.poseEdit?.fps ?? 30));
        const key = now.map((i) => i.id).join("|");
        if (key !== shownKey.current) {
          shownKey.current = key;
          setShown(now.map((i) => i.id));
        }
        const placed: { x: number; y: number; count: number }[] = [];
        let floorDrawn = false;
        for (const issue of now) {
          const node = marks.current.get(issue.id);
          if (!node) continue;
          let at: ScreenXY | null | undefined;
          if (issue.kind === "balance") {
            const floor = floorDrawn ? null : floorAt(issue, t, frame);
            if (floor) {
              floorDrawn = true;
              floorShown = true;
              at = floor.com;
              area.current?.setAttribute("points", floor.area.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
              if (com.current) {
                com.current.style.display = "";
                com.current.setAttribute("transform", `translate(${floor.com.x.toFixed(1)} ${floor.com.y.toFixed(1)})`);
              }
              const top = comTop.current;
              if (top && floor.top) {
                top.style.display = "";
                top.setAttribute("transform", `translate(${floor.top.x.toFixed(1)} ${floor.top.y.toFixed(1)})`);
              }
              const line = plumb.current;
              if (line && floor.top) {
                line.style.display = "";
                line.setAttribute("x1", floor.top.x.toFixed(1));
                line.setAttribute("y1", floor.top.y.toFixed(1));
                line.setAttribute("x2", floor.com.x.toFixed(1));
                line.setAttribute("y2", floor.com.y.toFixed(1));
              }
            } else at = frame.joints.Hips ?? frame.points.hips;
          } else at = frame.joints[issue.joint] ?? frame.points[issue.point];
          if (!at) {
            node.style.visibility = "hidden";
            continue;
          }
          // Marks on joints close together (both feet, a foot and its toes) line their badges up in a row.
          const here = at;
          const near = placed.find((p) => Math.hypot(p.x - here.x, p.y - here.y) < CLUSTER_PX);
          const slot = near ? near.count++ : 0;
          if (!near) placed.push({ x: here.x, y: here.y, count: 1 });
          node.style.visibility = "";
          node.style.transform = `translate3d(${here.x.toFixed(1)}px, ${here.y.toFixed(1)}px, 0)`;
          // The badge beside the joint (in a row with its neighbours), moved off the stage's controls.
          const wantX = here.x + BADGE_DX + (near ? near.x - here.x : 0) + slot * SLOT_PX;
          const wantY = here.y + BADGE_DY + (near ? near.y - here.y : 0);
          const badge = clearOf(wantX, wantY, keepOut, el.clientWidth, el.clientHeight);
          // A joint behind one of the stage's controls: no ring over that control, the badge above it says it.
          const covered = keepOut.some((k) => here.x > k.left && here.x < k.right && here.y > k.top && here.y < k.bottom) ? "true" : "false";
          if (node.dataset.covered !== covered) node.dataset.covered = covered;
          node.style.setProperty("--shift-x", `${(badge.x - here.x - BADGE_DX).toFixed(1)}px`);
          node.style.setProperty("--shift-y", `${(badge.y - here.y - BADGE_DY).toFixed(1)}px`);
          // The label opens towards the middle of the stage.
          const flip = badge.x > el.clientWidth - 280 ? "true" : "false";
          if (node.dataset.flip !== flip) node.dataset.flip = flip;
        }
        if (!floorDrawn) hideFloor();
      },
    };
    return () => {
      poseStage.marks = null;
    };
  }, []);

  if (!editorOpen || !report) return null;
  const issues = shown.map((id) => report.issues.find((i) => i.id === id)).filter((i): i is BodyIssue => Boolean(i));
  return (
    <div
      ref={root}
      className="body-marks pointer-events-none absolute inset-0 overflow-hidden"
      data-ready="false"
      data-pending={pending ? "true" : undefined}
      style={{ ["--badge-dx" as string]: `${BADGE_DX}px`, ["--badge-dy" as string]: `${BADGE_DY}px` }}
      data-body-marks
    >
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <polygon ref={area} className="balance-area" points="" />
        <line ref={plumb} className="balance-plumb" style={{ display: "none" }} />
        <circle ref={comTop} r="4.5" className="balance-com-top" style={{ display: "none" }} />
        <g ref={com} className="balance-com" style={{ display: "none" }}>
          <circle r="9" className="balance-com-halo" />
          <circle r="6.5" />
          <path d="M-3.6 -3.6 L3.6 3.6 M3.6 -3.6 L-3.6 3.6" />
        </g>
      </svg>
      {issues.length ? (
        <ul aria-label="Body check problems on the body" className="m-0 list-none p-0">
          {issues.map((issue) => (
            <li
              key={issue.id}
              ref={(node) => {
                if (node) marks.current.set(issue.id, node);
                else marks.current.delete(issue.id);
              }}
              className="body-mark"
              data-severity={issue.severity}
              data-kind={issue.kind}
              data-body-mark={issue.id}
              style={{ visibility: "hidden" }}
            >
              {issue.kind === "balance" ? null : <span className="body-mark-ring" aria-hidden="true" />}
              <button
                type="button"
                className="body-mark-badge pointer-events-auto"
                aria-label={`${issue.severity === "error" ? "Problem" : "Warning"}: ${issue.title}, ${issue.where}. ${issue.detail}. ${issue.fix}. Select the ${issue.part.toLowerCase()} to fix it.`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setMessage(focusIssue(issue))}
              >
                <IssueGlyph severity={issue.severity} size={18} />
                <span className="body-mark-label" aria-hidden="true">
                  <span className="font-semibold text-(--m3-on-surface)">{issue.title}</span>
                  <span className="block text-(--m3-on-surface-variant)">{issue.detail}</span>
                  <span className="mt-0.5 block text-(--m3-on-surface)">{`Fix: ${issue.fix}`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="sr-only" role="status" aria-live="polite">
        {message}
      </div>
    </div>
  );
}
