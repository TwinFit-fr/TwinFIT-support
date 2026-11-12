"use client";

import { useEffect, useRef } from "react";
import { Pause, Play, Redo2, Undo2 } from "lucide-react";
import { poseClipFromDraft, type PoseClipJson } from "@/lib/studio/anatomy";
import { useConfirm } from "@/components/ui/confirm";
import { DEFAULT_PARAMS } from "@/lib/studio/exercise-templates";
import { togglePlayback } from "@/lib/studio/playback";
import { originLabel } from "@/lib/studio/pose-origin";
import { isPointId } from "@/lib/studio/pose-points";
import { useStudioStore } from "@/lib/studio/store";
import { AllJoints } from "./all-joints";
import { BodyChecks } from "./body-checks";
import { DraftAiNotes, DraftOriginLine, DraftOriginNotes } from "./draft-origin";
import { ExerciseSettings } from "./exercise-settings";
import { PointProperties } from "./point-properties";
import { PoseBody } from "./pose-body";
import { PoseEditorActions, type SaveMode } from "./pose-editor-actions";
import { PoseStrip } from "./pose-strip";
import { IconButton, M3Button } from "./ui";

export type { SaveMode } from "./pose-editor-actions";

/**
 * Keyframe editor of a pose clip. It always holds something: the exercise's saved clip or an
 * instant draft, with its origin on top. Poses are played as a boomerang (or a cycle). With no
 * body point selected the panel holds what applies to the pose (exercise settings and the AI
 * draft, the poses, support and pins, every joint folded away); a point selected on the stage
 * swaps it for that point's properties: its own joints, its pin and what Mirror copies. Save
 * stores a draft as a new clip and overwrites an opened clip; "Save as copy" keeps the original.
 */
export function PoseEditor({
  onSave,
  saving,
  onRevert,
}: {
  onSave: (clip: PoseClipJson, label: string, mode: SaveMode) => Promise<void>;
  saving: boolean;
  /** Drop the editor's poses: the exercise lands again on its clip or its instant draft. */
  onRevert: () => void;
}) {
  const confirm = useConfirm();
  const draft = useStudioStore((s) => s.poseEdit);
  const report = useStudioStore((s) => s.bodyReport);
  const playing = useStudioStore((s) => s.playing);
  const undo = useStudioStore((s) => s.undoPose);
  const redo = useStudioStore((s) => s.redoPose);
  const canUndo = useStudioStore((s) => (s.poseEdit?.history.length ?? 0) > 0);
  const canRedo = useStudioStore((s) => (s.poseEdit?.future.length ?? 0) > 0);
  const selected = useStudioStore((s) => (s.poseEdit && isPointId(s.poseEdit.dragTarget) ? s.poseEdit.dragTarget : null));
  const scroller = useRef<HTMLDivElement>(null);

  // Another point (or none) swaps what the panel holds: it starts at the top, the point's name first.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [selected]);

  // Ctrl/Cmd+Z undoes, with Shift (or Ctrl+Y) redoes, unless the keys belong to a text field (Ctrl+S: see PoseEditorActions).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && (target as HTMLInputElement).type !== "range") return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Leaving the page with unsaved poses asks first (the browser's own prompt).
  const dirty = draft?.dirty ?? false;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (!draft) return null;

  const errors = report?.issues.filter((issue) => issue.severity === "error") ?? [];
  /** Saving what fails as a body takes a decision: the animator may mean it. The same items as the body checks list. */
  const save = async (mode: SaveMode) => {
    if (errors.length) {
      const ok = await confirm({
        title: `Save with ${errors.length} body problem${errors.length === 1 ? "" : "s"}?`,
        description: errors.map((e) => `• ${e.title} (${e.where}): ${e.detail}`).join("\n"),
        confirmLabel: "Save anyway",
        variant: "danger",
      });
      if (!ok) return;
    }
    await onSave(poseClipFromDraft(draft), label, mode);
  };
  const revert = async () => {
    if (draft.dirty) {
      const ok = await confirm({
        title: draft.vectorId ? `Revert to clip #${draft.sourceSeq}?` : "Revert to the starting draft?",
        description: "The changes you made since are dropped (undo cannot bring them back).",
        confirmLabel: "Revert",
        variant: "danger",
      });
      if (!ok) return;
    }
    onRevert();
  };
  /** Stored as the new row's prompt, so the list says where the clip came from. */
  const label = originLabel(draft.origin, draft.edited, DEFAULT_PARAMS).text;
  const noTemplate = draft.origin.kind === "neutral" && draft.origin.reason === "no-template" && !draft.edited;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: where these poses came from (and whether you changed them), undo, play */}
      <div className="border-b border-(--m3-outline-variant) px-3 py-2.5">
        <div className="flex items-center gap-2">
          <DraftOriginLine className="flex-1" />
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} className="h-8 w-8">
              <Undo2 className="h-4 w-4" />
            </IconButton>
            <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} className="h-8 w-8">
              <Redo2 className="h-4 w-4" />
            </IconButton>
            <M3Button size="sm" variant="tonal" onClick={togglePlayback} title={playing ? "Pause where it is (Space)" : "Play the loop from the playhead (Space)"}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {/* Icon-only in a narrow pane, so the clip's title keeps its room. */}
              <span className="sr-only @[22rem]/pane:not-sr-only">{playing ? "Pause" : "Play"}</span>
            </M3Button>
          </div>
        </div>
        {/* What a capture leaves out, and what the AI said about a draft: across the full width. */}
        <DraftOriginNotes />
        <DraftAiNotes />
      </div>

      <div ref={scroller} className="studio-scroll min-h-0 flex-1 overflow-y-auto" data-pose-panel={selected ? "point" : "pose"}>
        {selected ? (
          // A point selected on the stage: its own joints, pin and Mirror, and nothing else.
          <PointProperties key={selected} point={selected} />
        ) : (
          <>
            {/* The template's settings and "Draft with AI", which sets them: a change rebuilds every pose */}
            <ExerciseSettings />
            <PoseStrip />
            <PoseBody />
            <AllJoints />
          </>
        )}
      </div>

      {/* What the validator says about these poses on this avatar: pinned between the scroll area and the footer, so it is never scrolled out of sight or covered. */}
      <div className="studio-scroll max-h-[34%] shrink-0 overflow-y-auto">
        <BodyChecks />
      </div>

      <PoseEditorActions quiet={noTemplate} capture={draft.origin.kind === "capture" ? { seq: draft.origin.seq } : null} vectorId={draft.vectorId} sourceSeq={draft.sourceSeq} dirty={draft.dirty} saving={saving} onSave={(mode) => void save(mode)} onRevert={() => void revert()} />
    </div>
  );
}
