"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Copy, Link2, Pause, Play, Plus, Save, Trash2, X } from "lucide-react";
import {
  LOOP_MODES,
  ORIENTATIONS,
  POSE_GROUPS,
  getPoseValue,
  mirrorPath,
  poseClipFromDraft,
  setPoseValue,
  type LoopMode,
  type Orientation,
  type PoseClipJson,
  type PoseField,
  type PoseGroup,
} from "@/lib/studio/anatomy";
import { useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { Chip, IconButton, M3Button, Segmented, Select, Section } from "./ui";

const LOOP_LABEL: Record<LoopMode, { label: string; title: string }> = {
  cycle: { label: "1·2·3·1", title: "Last pose returns to the first" },
  pingpong: { label: "1·2·3·2·1", title: "There and back: a repetition" },
  once: { label: "1·2·3", title: "Play once, no return" },
};

function Slider({
  field,
  value,
  onChange,
}: {
  field: PoseField;
  value: number | null;
  onChange: (value: number) => void;
}) {
  const step = field.step ?? 1;
  const shown = value ?? 0;
  return (
    <label className="grid grid-cols-[1fr_56px] items-center gap-2 text-[11px]">
      <span className="flex items-center justify-between text-(--m3-on-surface-variant)">
        <span>{field.label}</span>
        <span className="font-mono tabular-nums text-(--m3-on-surface)">
          {field.unit === "m" ? shown.toFixed(2) : Math.round(shown)}
          {field.unit}
        </span>
      </span>
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={step}
        value={field.unit === "m" ? shown.toFixed(2) : Math.round(shown)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 rounded-lg border border-(--m3-outline-variant) bg-(--m3-surface-container) px-1.5 text-right font-mono text-[11px] text-(--m3-on-surface) outline-none focus-visible:border-(--m3-primary)"
      />
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={step}
        value={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        className="col-span-2 h-1.5 w-full cursor-pointer accent-(--m3-primary)"
      />
    </label>
  );
}

function GroupCard({
  group,
  values,
  open,
  onToggle,
  onChange,
}: {
  group: PoseGroup;
  values: (path: string) => number | null;
  open: boolean;
  onToggle: () => void;
  onChange: (path: string, value: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-(--m3-surface-container) p-3">
      <button type="button" onClick={onToggle} className="flex w-full cursor-pointer items-center justify-between text-left text-xs font-semibold tracking-tight">
        {group.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          {group.fields.map((field) => (
            <Slider key={field.path} field={field} value={values(field.path)} onChange={(v) => onChange(field.path, v)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Keyframe editor of a pose clip: pick a pose, move its joints with sliders (optionally mirrored),
 * choose how the poses loop and how long a loop takes, preview, save as a new version of the clip.
 * The canvas holds the selected pose while paused and plays the whole draft on play.
 */
export function PoseEditor({ onSave, saving }: { onSave: (clip: PoseClipJson, label: string) => Promise<void>; saving: boolean }) {
  const draft = useStudioStore((s) => s.poseEdit);
  const stop = useStudioStore((s) => s.stopPoseEdit);
  const setKeyframe = useStudioStore((s) => s.setPoseKeyframe);
  const updatePose = useStudioStore((s) => s.updatePose);
  const setOptions = useStudioStore((s) => s.setPoseEditOptions);
  const duplicatePose = useStudioStore((s) => s.duplicatePose);
  const removePose = useStudioStore((s) => s.removePose);
  const playing = useStudioStore((s) => s.playing);
  const togglePlaying = useStudioStore((s) => s.togglePlaying);
  const [open, setOpen] = useState<Record<string, boolean>>({ hips: true, left_arm: true, left_leg: true, implement: true });

  const pose = draft?.poses[draft.keyframe];
  const groups = useMemo(
    () => POSE_GROUPS.filter((g) => g.id !== "implement" || draft?.twoHanded),
    [draft?.twoHanded],
  );
  if (!draft || !pose) return null;

  const change = (path: string, value: number) => {
    let next = setPoseValue(pose, path, value);
    const other = draft.mirror ? mirrorPath(path) : null;
    if (other) next = setPoseValue(next, other, value);
    updatePose(draft.keyframe, next);
  };

  const label = draft.sourceSeq ? `Edited from #${draft.sourceSeq}` : "Pose editor";

  return (
    <div className="studio-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-(--m3-outline-variant) px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">Pose editor</div>
            <h2 className="mt-0.5 text-sm font-semibold tracking-tight">{label}</h2>
          </div>
          <div className="flex items-center gap-1">
            <IconButton label={playing ? "Pause (hold the selected pose)" : "Play the loop"} onClick={togglePlaying} active={playing} className="h-8 w-8">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </IconButton>
            <IconButton label="Close the editor (discard changes)" onClick={stop} disabled={saving} className="h-8 w-8">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {draft.poses.map((_, i) => (
            <Chip key={i} selected={i === draft.keyframe} onClick={() => setKeyframe(i)} className="h-7 px-3">
              {i + 1}
            </Chip>
          ))}
          <IconButton label="Duplicate this pose after itself" onClick={() => duplicatePose(draft.keyframe)} disabled={draft.poses.length >= 8} className="h-7 w-7">
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Remove this pose" onClick={() => removePose(draft.keyframe)} disabled={draft.poses.length <= 2} className="h-7 w-7">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
          <span className="ml-auto text-[11px] text-(--m3-on-surface-variant)">Pose {draft.keyframe + 1} of {draft.poses.length}</span>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <Section title="Loop">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={draft.mode}
              onChange={(mode) => setOptions({ mode })}
              size="sm"
              options={LOOP_MODES.map((m) => ({ value: m, label: LOOP_LABEL[m].label, title: LOOP_LABEL[m].title }))}
            />
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-(--m3-on-surface-variant)">
              seconds
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                value={draft.durationS}
                onChange={(e) => setOptions({ durationS: Math.max(0.5, Number(e.target.value) || 0.5) })}
                className="h-7 w-16 rounded-lg border border-(--m3-outline-variant) bg-(--m3-surface-container) px-1.5 text-right font-mono text-[11px] text-(--m3-on-surface) outline-none focus-visible:border-(--m3-primary)"
              />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip selected={draft.mirror} onClick={() => setOptions({ mirror: !draft.mirror })} title="A change on one side applies to the other">
              <Link2 className="h-3.5 w-3.5" /> Mirror sides
            </Chip>
            <Chip selected={draft.twoHanded} onClick={() => setOptions({ twoHanded: !draft.twoHanded })} title="The hands reach a bar: its position per pose drives the arms">
              Two-handed implement
            </Chip>
            <Select
              value={pose.orientation}
              onChange={(e) => updatePose(draft.keyframe, { ...pose, orientation: e.target.value as Orientation })}
              className="h-7 w-32 py-0 text-[11px]"
              aria-label="Orientation"
            >
              {ORIENTATIONS.map((o) => (
                <option key={o} value={o}>
                  {o.replace("_", " ")}
                </option>
              ))}
            </Select>
          </div>
        </Section>

        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            values={(path) => getPoseValue(pose, path)}
            open={Boolean(open[group.id])}
            onToggle={() => setOpen((o) => ({ ...o, [group.id]: !o[group.id] }))}
            onChange={change}
          />
        ))}

        <div className="flex items-center justify-end gap-2 pt-1">
          <M3Button variant="text" onClick={() => duplicatePose(draft.keyframe)} disabled={draft.poses.length >= 8}>
            <Plus className="h-3.5 w-3.5" /> Add pose
          </M3Button>
          <M3Button variant="filled" onClick={() => void onSave(poseClipFromDraft(draft), label)} busy={saving} disabled={!draft.dirty && draft.vectorId !== null}>
            <Save className="h-4 w-4" /> Save as new version
          </M3Button>
        </div>
      </div>
    </div>
  );
}
