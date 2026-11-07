"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useState } from "react";
import {
  Box,
  Crosshair,
  Dumbbell,
  Grid3x3,
  MonitorOff,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useStudioStore, type CameraPreset, type SceneSource } from "@/lib/studio/store";
import { VECTOR_STATUS_LABEL } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { EmptyState, IconButton, Segmented } from "../ui";
import { useMovementClip } from "./movement-clip";
import { useCanvasCommits } from "./render-stats";
import type { ModelInfo } from "./studio-canvas";

const StudioCanvas = dynamic(() => import("./studio-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-(--m3-on-surface-variant)">
      Starting the 3D workspace…
    </div>
  ),
});

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

const PRESETS: { value: CameraPreset; label: string; title: string }[] = [
  { value: "front", label: "Front", title: "Front (1)" },
  { value: "three-quarter", label: "¾", title: "Three-quarter (2)" },
  { value: "side", label: "Side", title: "Side (3)" },
];
const SPEEDS = [0.25, 0.5, 1, 2];

/** Playback and view controls: a floating glass toolbar, state in the store. */
function Toolbar() {
  const playing = useStudioStore((s) => s.playing);
  const togglePlaying = useStudioStore((s) => s.togglePlaying);
  const speed = useStudioStore((s) => s.speed);
  const setSpeed = useStudioStore((s) => s.setSpeed);
  const preset = useStudioStore((s) => s.cameraPreset);
  const setPreset = useStudioStore((s) => s.setCameraPreset);
  const showGrid = useStudioStore((s) => s.showGrid);
  const toggleGrid = useStudioStore((s) => s.toggleGrid);
  const showEquipment = useStudioStore((s) => s.showEquipment);
  const toggleEquipment = useStudioStore((s) => s.toggleEquipment);
  const cleanMocap = useStudioStore((s) => s.cleanMocap);
  const toggleCleanMocap = useStudioStore((s) => s.toggleCleanMocap);
  const resetView = useStudioStore((s) => s.resetView);

  useShortcuts({
    " ": togglePlaying,
    "1": () => setPreset("front"),
    "2": () => setPreset("three-quarter"),
    "3": () => setPreset("side"),
    g: toggleGrid,
    e: toggleEquipment,
    r: resetView,
  });

  return (
    <div className="studio-glass pointer-events-auto flex items-center gap-1 rounded-full p-1.5 shadow-2xl">
      <IconButton label={playing ? "Pause (space)" : "Play (space)"} onClick={togglePlaying} active={playing}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </IconButton>
      <button
        type="button"
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
        title="Playback speed"
        className="studio-state h-9 min-w-[3.25rem] cursor-pointer rounded-full px-2 font-mono text-xs tabular-nums text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)"
      >
        {speed}×
      </button>
      <span className="mx-1 h-5 w-px bg-(--m3-outline-variant)" />
      <Segmented size="sm" value={preset} options={PRESETS} onChange={setPreset} className="border-transparent" />
      <IconButton label="Reset view (R)" onClick={resetView}>
        <RotateCcw className="h-4 w-4" />
      </IconButton>
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

function Hud({
  scene,
  clipState,
  info,
}: {
  scene: SceneSource;
  clipState: { loading: boolean; error: string | null };
  info: ModelInfo | null;
}) {
  const commits = useCanvasCommits();
  const clipText = !scene.vectorId
    ? "No clip selected"
    : scene.vectorStatus !== "ready"
      ? `${VECTOR_STATUS_LABEL[scene.vectorStatus ?? "pending"]} · #${scene.vectorSeq}`
      : clipState.loading
        ? "Loading clip…"
        : clipState.error
          ? `Clip error: ${clipState.error}`
          : `Playing #${scene.vectorSeq}${scene.vectorFps ? ` · ${scene.vectorFps} fps` : ""}`;
  return (
    <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
      <div className="studio-glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]">
        <span className="h-1.5 w-1.5 rounded-full bg-(--m3-primary)" />
        <span className="font-medium text-(--m3-on-surface)">{scene.avatarName ?? "No avatar"}</span>
        {scene.rig ? (
          <span className="text-(--m3-on-surface-variant)">
            {scene.rig}
            {info ? ` · ${info.bones} bones · ${info.heightM.toFixed(2)} m` : ""}
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "studio-glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]",
          clipState.error ? "text-(--m3-error)" : "text-(--m3-on-surface-variant)",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            scene.vectorStatus === "ready"
              ? "bg-(--m3-success)"
              : scene.vectorId
                ? "bg-(--m3-warning) studio-pulse"
                : "bg-(--m3-outline)",
          )}
        />
        {clipText}
      </div>
      {info?.missingSockets.length ? (
        <div className="studio-glass rounded-full px-3 py-1.5 text-[11px] text-(--m3-warning)">
          Sockets without a bone: {info.missingSockets.join(", ")}
        </div>
      ) : null}
      {process.env.NODE_ENV !== "production" ? (
        <div
          className="studio-glass rounded-full px-3 py-1 font-mono text-[10px] text-(--m3-on-surface-variant)/70"
          title="React commits of the 3D canvas. It should stay still while you type, scroll or the queue refreshes."
        >
          canvas commits {commits}
        </div>
      ) : null}
    </div>
  );
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

  if (webgl === false) {
    return (
      <EmptyState
        icon={<MonitorOff className="h-5 w-5" />}
        title="WebGL is not available here"
        body="This browser cannot create a 3D context. Open the Studio in a browser with hardware acceleration enabled to see the avatar."
      />
    );
  }

  if (!scene.modelUrl) {
    return (
      <EmptyState
        icon={<Box className="h-5 w-5" />}
        title="No base avatar"
        body="Upload a rigged .glb from the avatar menu in the top bar to start animating."
      />
    );
  }

  return (
    <div className="relative h-full w-full">
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
      {progress !== null || modelError ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "studio-glass flex max-w-[36ch] items-center gap-2 rounded-full px-3 py-1.5 text-center text-xs",
              modelError ? "text-(--m3-error)" : "text-(--m3-on-surface)",
            )}
          >
            {modelError ? null : <span className="h-2 w-2 animate-pulse rounded-full bg-(--m3-primary)" />}
            {modelError ? `Could not load the model: ${modelError}` : `Loading avatar… ${Math.round(progress ?? 0)}%`}
          </div>
        </div>
      ) : null}
      <Hud
        scene={scene}
        clipState={clipSolveError && clipSolveError.key === scene.clipUrl ? { ...clipState, error: clipSolveError.message } : clipState}
        info={info}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
        <Toolbar />
      </div>
      <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-(--m3-on-surface-variant)/70">
        <Crosshair className="h-3 w-3" /> orbit · pan · zoom
      </div>
    </div>
  );
});
