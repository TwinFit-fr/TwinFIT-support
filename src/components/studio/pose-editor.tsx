"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftToLine, ArrowRightToLine, ChevronLeft, ChevronRight, Copy, Link2, Pause, Pin, PinOff, Play, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import {
  ANCHOR_IDS,
  LOOP_MODES,
  ORIENTATIONS,
  POSE_GROUPS,
  poseClipFromDraft,
  type AnchorId,
  type LoopMode,
  type Orientation,
  type PoseClipJson,
} from "@/lib/studio/anatomy";
import { useConfirm } from "@/components/ui/confirm";
import { useDragMode } from "@/lib/studio/drag-mode";
import { DEFAULT_PARAMS } from "@/lib/studio/exercise-templates";
import { applyPoseEdit } from "@/lib/studio/pose-drag";
import { originLabel } from "@/lib/studio/pose-origin";
import { POINT_LABEL, isPointId } from "@/lib/studio/pose-points";
import { MAX_POSES, useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { BodyChecks } from "./body-checks";
import { DraftAiNotes, DraftOriginLine } from "./draft-origin";
import { ExerciseSettings } from "./exercise-settings";
import { PoseEditorActions, type SaveMode } from "./pose-editor-actions";
import { PoseSliders as Sliders } from "./pose-sliders";
import { Chip, IconButton, M3Button, NumberField, Segmented, Select, TextInput } from "./ui";

export type { SaveMode } from "./pose-editor-actions";

const LOOP_LABEL: Record<LoopMode, { label: string; title: string }> = {
  pingpong: { label: "Boomerang", title: "There and back through the poses: one repetition" },
  cycle: { label: "Cycle", title: "The last pose returns to the first" },
  once: { label: "Once", title: "Play the poses once, no return" },
};

type Tab = "body" | "arms" | "legs" | "bar";
const ANCHOR_LABEL: Record<AnchorId, string> = {
  left_foot: "L foot",
  right_foot: "R foot",
  left_hand: "L hand",
  right_hand: "R hand",
  left_knee: "L knee",
  right_knee: "R knee",
};

const group = (id: string) => POSE_GROUPS.find((g) => g.id === id)!;

/** A foot this far above the other (metres) is off the floor, and its ankle is the animator's again. */
const RAISED_M = 0.08;

/**
 * Keyframe editor of a pose clip. It always holds something: the exercise's saved clip or an
 * instant draft, with its origin on top. Poses are played as a boomerang (or a cycle); each pose
 * is set on the stage or with sliders per joint, sides mirrored by default; feet, hands and
 * knees can be pinned where they are so the rest of the pose moves around them. Save stores a
 * draft as a new clip and overwrites an opened clip; "Save as copy" keeps the original.
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
  const probe = useStudioStore((s) => s.poseProbe);
  const issues = useStudioStore((s) => s.poseIssues);
  const { draggable } = useDragMode();
  const setKeyframe = useStudioStore((s) => s.setPoseKeyframe);
  const updatePose = useStudioStore((s) => s.updatePose);
  const endGesture = useStudioStore((s) => s.endPoseGesture);
  const setOptions = useStudioStore((s) => s.setPoseEditOptions);
  const setLabel = useStudioStore((s) => s.setPoseLabel);
  const setWeight = useStudioStore((s) => s.setPoseWeight);
  const duplicatePose = useStudioStore((s) => s.duplicatePose);
  const removePose = useStudioStore((s) => s.removePose);
  const movePose = useStudioStore((s) => s.movePose);
  const playing = useStudioStore((s) => s.playing);
  const togglePlaying = useStudioStore((s) => s.togglePlaying);
  const undo = useStudioStore((s) => s.undoPose);
  const redo = useStudioStore((s) => s.redoPose);
  const copyLimb = useStudioStore((s) => s.copyLimbToOtherSide);
  const canUndo = useStudioStore((s) => (s.poseEdit?.history.length ?? 0) > 0);
  const canRedo = useStudioStore((s) => (s.poseEdit?.future.length ?? 0) > 0);
  const [tab, setTab] = useState<Tab>("body");

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

  const pose = draft?.poses[draft.keyframe];
  const tabs = useMemo(
    () =>
      [
        { value: "body" as Tab, label: "Body" },
        { value: "arms" as Tab, label: "Arms" },
        { value: "legs" as Tab, label: "Legs" },
        ...(draft?.twoHanded ? [{ value: "bar" as Tab, label: "Bar" }] : []),
      ],
    [draft?.twoHanded],
  );
  if (!draft || !pose) return null;
  const i = draft.keyframe;
  const n = draft.poses.length;

  // The same rule as a drag on the stage (Mirror, goals): see pose-drag.ts.
  const change = (path: string, value: number, gesture: boolean) => updatePose(i, applyPoseEdit(pose, { [path]: value }, { mirror: draft.mirror }), gesture);
  const errors = issues.filter((issue) => issue.severity === "error");
  /** Saving what fails as a body takes a decision: the animator may mean it. */
  const save = async (mode: SaveMode) => {
    if (errors.length) {
      const ok = await confirm({
        title: `Save with ${errors.length} failed body check${errors.length === 1 ? "" : "s"}?`,
        description: errors.map((e) => e.message).join(" · "),
        confirmLabel: "Save anyway",
        variant: "danger",
      });
      if (!ok) return;
    }
    await onSave(poseClipFromDraft(draft), label, mode);
  };
  const togglePin = (id: AnchorId) => {
    const anchors = { ...(pose.anchors ?? {}) };
    if (anchors[id]) delete anchors[id];
    else if (probe[id]) anchors[id] = probe[id];
    else return;
    updatePose(i, { ...pose, anchors });
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
  const pinned = (id: AnchorId) => Boolean(pose.anchors?.[id]);
  const standing = pose.orientation === "standing";
  const feetFlat = pose.feet_flat !== false;
  /** Standing with flat feet, this foot on the floor: its ankle is derived. */
  const followsFloor = (side: "left" | "right") => {
    if (!standing || !feetFlat) return false;
    const own = probe[`${side}_foot`]?.[1];
    const other = probe[`${side === "left" ? "right" : "left"}_foot`]?.[1];
    return own === undefined || other === undefined || own - other < RAISED_M;
  };

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
            <M3Button size="sm" variant="tonal" onClick={togglePlaying} title={playing ? "Pause and hold the selected pose" : "Play the loop"}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {/* Icon-only in a narrow pane, so the clip's title keeps its room. */}
              <span className="sr-only @[22rem]/pane:not-sr-only">{playing ? "Pause" : "Play"}</span>
            </M3Button>
          </div>
        </div>
        {/* What the AI said about the draft on the stage: a line that opens to the full width. */}
        <DraftAiNotes />
      </div>

      <div className="studio-scroll min-h-0 flex-1 overflow-y-auto">
        {/* The template's settings and "Draft with AI", which sets them: a change rebuilds every pose */}
        <ExerciseSettings />
        {/* What the validator says about these poses on this avatar, right under what changes them */}
        <BodyChecks />
        {/* Pose strip */}
        <div className="border-b border-(--m3-outline-variant) px-4 py-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {draft.poses.map((_, k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKeyframe(k)}
                aria-current={k === i ? "true" : undefined}
                className={cn(
                  "studio-state flex h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border px-2 text-xs font-semibold tabular-nums",
                  k === i
                    ? "border-transparent bg-(--m3-primary) text-(--m3-on-primary) shadow-[var(--studio-glow)]"
                    : "border-(--m3-outline-variant) bg-(--m3-surface-container) text-(--m3-on-surface-variant)",
                )}
                title={draft.labels?.[k] ? `${k + 1} · ${draft.labels[k]}` : `Pose ${k + 1}`}
              >
                {k + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={() => duplicatePose(i)}
              disabled={n >= MAX_POSES}
              className="studio-state flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-(--m3-outline) text-(--m3-primary) disabled:opacity-40"
              title="Add a pose after this one (a copy of it)"
              aria-label="Add a pose after this one"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-(--m3-on-surface-variant)">
            <span className="mr-auto truncate">
              Pose {i + 1} of {n}
            </span>
            <IconButton label="Move this pose earlier" onClick={() => movePose(i, -1)} disabled={i === 0} className="h-7 w-7">
              <ChevronLeft className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Move this pose later" onClick={() => movePose(i, 1)} disabled={i === n - 1} className="h-7 w-7">
              <ChevronRight className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Duplicate this pose" onClick={() => duplicatePose(i)} disabled={n >= MAX_POSES} className="h-7 w-7">
              <Copy className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Remove this pose" onClick={() => removePose(i)} disabled={n <= 1} className="h-7 w-7">
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
          {/* Name and tempo of this pose */}
          <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
            <TextInput
              value={draft.labels?.[i] ?? ""}
              onChange={(e) => setLabel(i, e.target.value)}
              onBlur={endGesture}
              placeholder={`Name of pose ${i + 1}`}
              title="A short name for this pose, e.g. bottom or lockout"
              aria-label={`Name of pose ${i + 1}`}
              className="h-7 px-2 py-0 text-[11px]"
            />
            <label className="flex items-center gap-1 text-[10px] text-(--m3-on-surface-variant)" title="Relative time spent getting into this pose (1 = the same as the others; 2 = twice as slow)">
              tempo
              <NumberField
                aria-label={`Tempo into pose ${i + 1}`}
                min={0.1}
                max={10}
                step={0.1}
                digits={1}
                value={draft.weights?.[i] ?? 1}
                onCommit={(v) => {
                  setWeight(i, v);
                  endGesture();
                }}
                className="h-7 w-14 px-1.5 py-0 text-right text-[11px]"
              />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Segmented
              value={draft.mode}
              onChange={(mode) => setOptions({ mode })}
              size="sm"
              options={LOOP_MODES.map((m) => ({ value: m, label: LOOP_LABEL[m].label, title: LOOP_LABEL[m].title }))}
            />
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-(--m3-on-surface-variant)" title="Seconds of one loop">
              <NumberField
                aria-label="Seconds of one loop"
                min={0.5}
                max={30}
                step={0.5}
                digits={1}
                value={draft.durationS}
                onCommit={(v) => setOptions({ durationS: Math.max(0.5, v) })}
                className="h-7 w-14 px-1.5 py-0 text-right text-[11px]"
              />
              s
            </label>
          </div>
        </div>

        {/* Pins */}
        <div className="border-b border-(--m3-outline-variant) px-4 py-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">
            <span className="whitespace-nowrap">Pinned in this pose</span>
            <span className="normal-case tracking-normal">pinned points stay put while you move the rest</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ANCHOR_IDS.map((id) => (
              <Chip
                key={id}
                selected={pinned(id)}
                onClick={() => togglePin(id)}
                title={probe[id] ? `${ANCHOR_LABEL[id]} at ${probe[id].map((v) => v.toFixed(2)).join(", ")} m` : "Position not known yet"}
                className={cn("h-7", draft.dragTarget === id && "ring-1 ring-(--m3-primary)")}
              >
                {pinned(id) ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3 opacity-50" />}
                {ANCHOR_LABEL[id]}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-(--m3-on-surface-variant)" data-pose-editor-help>
            {draggable
              ? "On the stage, press any point of the body and drag it. In Exercise mode the settings above follow and every pose is rebuilt; in Limb mode that limb moves inside its range of motion. Arrow keys nudge the selected point."
              : "On the stage, press any point of the body and drag it: that limb moves inside its range of motion. Arrow keys nudge the selected point."}
            {isPointId(draft.dragTarget) ? ` Selected: ${POINT_LABEL[draft.dragTarget]}.` : ""}
          </p>
        </div>

        {/* Joints */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Segmented value={tab} onChange={setTab} size="sm" options={tabs} className="flex-1 justify-between" />
            <Chip selected={draft.mirror} onClick={() => setOptions({ mirror: !draft.mirror })} title="A change on one side applies to the other" className="h-7">
              <Link2 className="h-3 w-3" /> Mirror
            </Chip>
          </div>

          <div className="mt-3">
            {tab === "body" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                  <label className="text-[11px] text-(--m3-on-surface-variant)">
                    Support
                    <Select
                      value={pose.orientation}
                      onChange={(e) => updatePose(i, { ...pose, orientation: e.target.value as Orientation })}
                      className="mt-1 h-8 py-0 text-[11px]"
                      aria-label="Orientation"
                    >
                      {ORIENTATIONS.map((o) => (
                        <option key={o} value={o}>
                          {o.replace("_", " ")}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <div className="flex items-end gap-1.5 text-[11px] text-(--m3-on-surface-variant)">
                    <Chip selected={draft.twoHanded} onClick={() => setOptions({ twoHanded: !draft.twoHanded })} title="The hands hold a bar: its position per pose drives the arms" className="h-8 flex-1 justify-center whitespace-nowrap">
                      Bar in hands
                    </Chip>
                    {standing ? (
                      <Chip
                        selected={feetFlat}
                        onClick={() => updatePose(i, { ...pose, feet_flat: !feetFlat })}
                        title="On: the soles stay flat on the floor and the ankles follow from the legs. Off: the ankle sliders lift the heels (calf raise, tiptoe) and the toes stay down."
                        className="h-8 flex-1 justify-center whitespace-nowrap"
                      >
                        Flat feet
                      </Chip>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl bg-(--m3-surface-container) p-3">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">
                    <span>Hips & body</span>
                    <Chip
                      selected={pose.hips.height_m === null}
                      onClick={() =>
                        updatePose(i, {
                          ...pose,
                          hips: { ...pose.hips, height_m: pose.hips.height_m === null ? (probe.hips?.[1] ?? 0.9) : null },
                        })
                      }
                      title="Automatic: from the legs when standing, else the support's default. Off: the slider sets it, and standing the feet stay put while the legs follow."
                      className="h-6 normal-case tracking-normal"
                    >
                      Auto height
                    </Chip>
                  </div>
                  <Sliders fields={group("hips").fields} pose={pose} onChange={change} onGestureEnd={endGesture} />
                </div>
                <div className="rounded-2xl bg-(--m3-surface-container) p-3">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">Torso & head</div>
                  <Sliders fields={group("torso").fields} pose={pose} onChange={change} onGestureEnd={endGesture} />
                </div>
              </div>
            ) : null}
            {tab === "arms" || tab === "legs" ? (
              // Side by side only where each side gets a usable slider track; stacked in a narrow pane.
              <div className="grid grid-cols-1 gap-3 @[32rem]/pane:grid-cols-2">
                {(["left", "right"] as const).map((side) => (
                  <div key={side} className="rounded-2xl bg-(--m3-surface-container) p-3">
                    <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">
                      <span>
                        {side} {tab === "arms" ? "arm" : "leg"}
                      </span>
                      <IconButton
                        label={`Copy this ${tab === "arms" ? "arm" : "leg"} to the ${side === "left" ? "right" : "left"} side`}
                        onClick={() => copyLimb(i, tab === "arms" ? "arm" : "leg", side)}
                        className="h-6 w-6"
                      >
                        {side === "left" ? <ArrowRightToLine className="h-3 w-3" /> : <ArrowLeftToLine className="h-3 w-3" />}
                      </IconButton>
                    </div>
                    <Sliders fields={group(`${side}_${tab === "arms" ? "arm" : "leg"}`).fields} pose={pose} onChange={change} onGestureEnd={endGesture} compact side={side} followsFloor={tab === "legs" && followsFloor(side)} />
                  </div>
                ))}
              </div>
            ) : null}
            {tab === "bar" ? (
              <div className="rounded-2xl bg-(--m3-surface-container) p-3">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">Bar position in this pose</div>
                <Sliders fields={group("implement").fields} pose={pose} onChange={change} onGestureEnd={endGesture} />
                <p className="mt-2 text-[11px] leading-snug text-(--m3-on-surface-variant)">
                  The arms are solved to reach the bar with the catalog grip; the shoulder and elbow sliders only steer where the elbows point.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <PoseEditorActions quiet={noTemplate} vectorId={draft.vectorId} sourceSeq={draft.sourceSeq} dirty={draft.dirty} saving={saving} onSave={(mode) => void save(mode)} onRevert={() => void revert()} />
    </div>
  );
}
