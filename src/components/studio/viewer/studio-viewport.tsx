"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useState } from "react";
import { Box, Crosshair, Dumbbell, Grid3x3, MonitorOff, Sparkles } from "lucide-react";
import { useShortcuts } from "@/hooks/use-shortcuts";
import type { BodyIssue } from "@/lib/studio/body-issues";
import { debugEnabled } from "@/lib/studio/load-state";
import { togglePlayback } from "@/lib/studio/playback";
import { editingStatus } from "@/lib/studio/pose-origin";
import { useStudioStore, type SceneSource } from "@/lib/studio/store";
import { VECTOR_STATUS_LABEL } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { EmptyState, IconButton } from "../ui";
import { useMovementClip } from "./movement-clip";
import { AiDraftChip } from "../ai-draft";
import { IssueGlyph } from "../issue-glyph";
import { StudioLoader } from "../load-states";
import { InBetweenNote } from "./in-between-note";
import { BodyCheckMarks } from "./body-check-marks";
import { PosePointsLayer } from "./pose-points-layer";
import { ReferenceCard } from "./reference-card";
import { RigPointsLayer } from "./rig-points-layer";
import { useCanvasCommits } from "./render-stats";
import { VIEW_SHORTCUTS, ViewControls } from "./view-controls";
import type { ModelInfo } from "./studio-canvas";

const StudioCanvas = dynamic(() => import("./studio-canvas"), {
  ssr: false,
  loading: () => <StudioLoader label="Starting the 3D view…" />,
});

/** Developer readout of canvas commits: only with ?debug=1, read once when the stage opens. */
function useDebugReadouts(): boolean {
  const [on] = useState(() => typeof window !== "undefined" && debugEnabled(window.location.search));
  return on;
}

function CanvasCommits() {
  const commits = useCanvasCommits();
  return (
    <div
      data-dev-only
      className="studio-glass rounded-full px-3 py-1 font-mono text-[10px] text-(--m3-on-surface-variant)"
      title="React commits of the 3D canvas. It should stay still while you type, scroll or the queue refreshes."
    >
      canvas commits {commits}
    </div>
  );
}

/** False when the browser cannot give us a WebGL context (software-rendering sandboxes, disabled GPU). */
function probeWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function useWebGLSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setSupported(probeWebGL()), 0);
    return () => window.clearTimeout(id);
  }, []);
  return supported;
}

/** View controls: a floating glass toolbar. Playback lives in the timeline dock; Space plays and pauses anywhere. */
function Toolbar() {
  const showGrid = useStudioStore((s) => s.showGrid);
  const toggleGrid = useStudioStore((s) => s.toggleGrid);
  const showEquipment = useStudioStore((s) => s.showEquipment);
  const toggleEquipment = useStudioStore((s) => s.toggleEquipment);
  const cleanMocap = useStudioStore((s) => s.cleanMocap);
  const toggleCleanMocap = useStudioStore((s) => s.toggleCleanMocap);

  useShortcuts({
    " ": togglePlayback,
    ...VIEW_SHORTCUTS,
    g: toggleGrid,
    e: toggleEquipment,
  });

  return (
    <div className="studio-glass pointer-events-auto flex items-center gap-1 rounded-full p-1.5 shadow-2xl" role="group" aria-label="Stage view">
      <ViewControls />
      <span className="mx-1 h-5 w-px bg-(--m3-outline-variant)" />
      <IconButton label="Grid (G)" onClick={toggleGrid} active={showGrid}>
        <Grid3x3 className="h-4 w-4" />
      </IconButton>
      <IconButton label="Equipment (E)" onClick={toggleEquipment} active={showEquipment}>
        <Dumbbell className="h-4 w-4" />
      </IconButton>
      <IconButton
        label="Clean up motion-capture clips on load: feet on the floor and locked while in contact, hips drift removed, loop closed"
        onClick={toggleCleanMocap}
        active={cleanMocap}
      >
        <Sparkles className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

const NO_ISSUES: BodyIssue[] = [];

function Hud({
  scene,
  clipState,
  info,
  legendRef,
}: {
  scene: SceneSource;
  clipState: { loading: boolean; error: string | null };
  info: ModelInfo | null;
  /** Where the pose editor puts the legend of its point marks, under the status cards. */
  legendRef?: (el: HTMLDivElement | null) => void;
}) {
  const debug = useDebugReadouts();
  const issues = useStudioStore((s) => s.bodyReport?.issues ?? NO_ISSUES);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.length - errors.length;
  // While the editor holds poses the stage shows them, not the selected clip: say so (a string, so slider ticks do not re-render this).
  // The rig editor pauses posing: the status says that instead of the poses.
  const editing = useStudioStore((s) => (s.edit.mode !== "off" ? "Rig editor · posing paused" : s.poseEdit ? editingStatus(s.poseEdit) : null));
  const editingSaved = useStudioStore((s) => Boolean(s.poseEdit?.vectorId && !s.poseEdit.dirty));
  const noExercise = useStudioStore((s) => s.exerciseId === null);
  const clipText = editing
    ? editing
    : !scene.vectorId
      ? noExercise
        ? "No exercise open"
        : "No clip selected"
      : scene.vectorStatus !== "ready"
        ? `${VECTOR_STATUS_LABEL[scene.vectorStatus ?? "pending"]} · #${scene.vectorSeq}`
        : clipState.loading
          ? "Loading clip…"
          : clipState.error
            ? `Clip error: ${clipState.error}`
            : `Playing #${scene.vectorSeq}${scene.vectorFps ? ` · ${scene.vectorFps} fps` : ""}`;
  return (
    // Leaves room on the right for the axis gizmo and the rig editor button under it.
    <div className="stage-hud pointer-events-none absolute left-(--studio-stage-inset) top-(--studio-stage-inset) flex max-w-[calc(100%-var(--studio-gizmo-reserve)-2*var(--studio-stage-inset))] items-start gap-2">
      {/* Wraps onto a second line on a narrow stage instead of cutting the details. */}
      <div className="studio-glass flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-2xl px-3 py-1.5 text-[11px]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--m3-primary)" />
        <span className="font-medium text-(--m3-on-surface)">{scene.avatarName ?? "No avatar"}</span>
        {scene.rig ? (
          <span className="text-(--m3-on-surface-variant)">
            {scene.rig}
            <span className="stage-short-hide">{info ? ` · ${info.bones} bones · ${info.heightM.toFixed(2)} m` : ""}</span>
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "studio-glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]",
          clipState.error && !editing ? "text-(--m3-error)" : "text-(--m3-on-surface-variant)",
        )}
        data-stage-status
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            editing
              ? editingSaved
                ? "bg-(--m3-success)"
                : "bg-(--m3-warning)"
              : scene.vectorStatus === "ready"
              ? "bg-(--m3-success)"
              : scene.vectorId
                ? "bg-(--m3-warning) studio-pulse"
                : "bg-(--m3-outline)",
          )}
        />
        {clipText}
      </div>
      {/* The timeline rests between key poses: the body shown is a blend, a drag edits the nearest key. */}
      <InBetweenNote />
      {/* The AI draft on its way (Cancel), or waiting for review in the side panel. */}
      <AiDraftChip className="pointer-events-auto shadow-lg" onReview={reviewSuggestion} />
      {/* Where the body checks fail is marked on the body and the timeline; this only counts them. */}
      {issues.length ? (
        <div
          className={cn("studio-glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium", errors.length ? "text-(--m3-error)" : "text-(--m3-warning)")}
          title={issues.map((i) => `${i.title} · ${i.where}`).join("\n")}
          data-stage-checks
        >
          <IssueGlyph severity={errors.length ? "error" : "warning"} size={13} />
          {[errors.length ? `${errors.length} body problem${errors.length === 1 ? "" : "s"}` : "", warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}
        </div>
      ) : null}
      {info?.missingSockets.length ? (
        <div className="studio-glass rounded-full px-3 py-1.5 text-[11px] text-(--m3-warning)">
          Sockets without a bone: {info.missingSockets.join(", ")}
        </div>
      ) : null}
      <div ref={legendRef} className="empty:hidden" />
      {debug ? <CanvasCommits /> : null}
    </div>
  );
}


/** Brings the waiting AI suggestion in the side panel into view and puts the focus on Apply. */
function reviewSuggestion() {
  const card = document.querySelector<HTMLElement>("[data-ai-suggestion]");
  if (!card) return;
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  card.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  card.querySelector<HTMLButtonElement>("[data-ai-apply]")?.focus({ preventScroll: true });
}

/**
 * The centre pane. It has no props: it reads the scene slice of the store, which the workspace
 * replaces only when the avatar or the playable clip changes. Side-panel interaction, catalog
 * scrolling and queue polling never reach it.
 */
export const StudioViewport = memo(function StudioViewport() {
  const scene = useStudioStore((s) => s.scene);
  const clipState = useMovementClip(scene.clipUrl, scene.clipFormat);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const onModelInfo = useCallback((next: ModelInfo | null) => setInfo(next), []);
  const onProgress = useCallback((next: number | null) => setProgress(next), []);
  const onError = useCallback((next: string | null) => setModelError(next), []);
  // A pose clip that cannot be solved on this rig: reported by the canvas, shown while that clip is selected.
  const [clipSolveError, setClipSolveError] = useState<{ key: string | null; message: string } | null>(null);
  const onClipError = useCallback((message: string) => setClipSolveError({ key: scene.clipUrl, message }), [scene.clipUrl]);
  const webgl = useWebGLSupport();
  // Where the pose editor puts its mode bar: above the view toolbar.
  const [barsHost, setBarsHost] = useState<HTMLDivElement | null>(null);
  // Where it puts the legend of the point marks: under the status cards, top left.
  const [legendHost, setLegendHost] = useState<HTMLDivElement | null>(null);

  if (webgl === false) {
    return (
      <EmptyState
        icon={<MonitorOff className="h-5 w-5" />}
        title="WebGL is not available here"
        body="This browser cannot create a 3D context. Open the Studio in a browser with hardware acceleration enabled to see the avatar."
      />
    );
  }

  // The workspace shows loading, failure and the first run itself; this is a ready avatar without a model file.
  if (!scene.modelUrl) {
    return (
      <EmptyState
        icon={<Box className="h-5 w-5" />}
        title="This avatar has no model file"
        body="Choose another avatar in the top bar, or add one from its menu."
      />
    );
  }

  return (
    <div className="stage-frame relative flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
      <StudioCanvas
        avatarId={scene.avatarId}
        modelUrl={scene.modelUrl}
        heightM={scene.heightM}
        sockets={scene.sockets}
        clip={clipState.clip}
        onModelInfo={onModelInfo}
        onProgress={onProgress}
        onError={onError}
        onClipError={onClipError}
      />
      {/* Under the body points: a press on a point over the card always reaches the point. */}
      <ReferenceCard />
      <PosePointsLayer statusHost={barsHost} legendHost={legendHost} />
      {/* The rig editor's points, handled like the body points; only one of the two layers shows at a time. */}
      <RigPointsLayer statusHost={barsHost} legendHost={legendHost} />
      <BodyCheckMarks />
      {modelError ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="studio-glass flex max-w-[36ch] items-center gap-2 rounded-full px-3 py-1.5 text-center text-xs text-(--m3-error)">
            {`Could not load the model: ${modelError}`}
          </div>
        </div>
      ) : progress !== null ? (
        <StudioLoader className="pointer-events-none absolute inset-0" label={`Loading avatar… ${Math.round(progress)}%`} />
      ) : null}
      <Hud
        scene={scene}
        clipState={clipSolveError && clipSolveError.key === scene.clipUrl ? { ...clipState, error: clipSolveError.message } : clipState}
        info={info}
        legendRef={setLegendHost}
      />
      {/* Left of the axis gizmo, only where the stage is wide enough for it next to the HUD. */}
      <div className="pointer-events-none absolute right-(--studio-gizmo-reserve) top-(--studio-stage-inset) hidden items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-(--m3-on-surface-variant) @4xl/stage:flex">
        <Crosshair className="h-3 w-3" /> orbit · pan · zoom
      </div>
      </div>
      {/* The bottom bars. Over the canvas on a tall stage; in a strip under it on a short one (globals.css), so they never cover the avatar. */}
      <div className="stage-bars pointer-events-none flex flex-col items-center gap-5">
        <div ref={setBarsHost} className="flex w-full justify-center empty:hidden" />
        <Toolbar />
      </div>
    </div>
  );
});
