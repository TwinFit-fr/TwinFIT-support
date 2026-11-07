"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Link2, Pause, Pin, PinOff, Play, Plus, Save, Trash2, X } from "lucide-react";
import {
  ANCHOR_IDS,
  LOOP_MODES,
  ORIENTATIONS,
  POSE_GROUPS,
  getPoseValue,
  mirrorPath,
  poseClipFromDraft,
  setPoseValue,
  type AnchorId,
  type LoopMode,
  type Orientation,
  type PoseAngles,
  type PoseClipJson,
  type PoseField,
} from "@/lib/studio/anatomy";
import { useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { Chip, IconButton, M3Button, Segmented, Select } from "./ui";

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

function Slider({ field, value, onChange, compact = false }: { field: PoseField; value: number | null; onChange: (value: number) => void; compact?: boolean }) {
  const step = field.step ?? 1;
  const shown = value ?? 0;
  const text = field.unit === "m" ? shown.toFixed(2) : String(Math.round(shown));
  return (
    <div className="text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-(--m3-on-surface-variant)", compact && "text-[10px]")}>{field.label}</span>
        <span className="flex items-center gap-0.5 font-mono tabular-nums">
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={step}
            value={text}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-6 w-14 rounded-md border border-(--m3-outline-variant) bg-(--m3-surface-container-high) px-1 text-right text-[11px] text-(--m3-on-surface) outline-none focus-visible:border-(--m3-primary)"
          />
          <span className="w-3 text-(--m3-on-surface-variant)">{field.unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={step}
        value={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-1.5 w-full cursor-pointer accent-(--m3-primary)"
      />
    </div>
  );
}

/** One column of sliders, for a side or a central group. */
function Sliders({ fields, pose, onChange, compact }: { fields: PoseField[]; pose: PoseAngles; onChange: (path: string, value: number) => void; compact?: boolean }) {
  return (
    <div className="space-y-2.5">
      {fields.map((f) => (
        <Slider key={f.path} field={f} value={getPoseValue(pose, f.path)} onChange={(v) => onChange(f.path, v)} compact={compact} />
      ))}
    </div>
  );
}

/**
 * Keyframe editor of a pose clip. Poses are added one by one and played as a boomerang (or a
 * cycle); each pose is set with sliders per joint, sides mirrored by default; feet, hands and
 * knees can be pinned where they are so the rest of the pose moves around them. Saved as a new
 * version of the clip.
 */
export function PoseEditor({ onSave, saving }: { onSave: (clip: PoseClipJson, label: string) => Promise<void>; saving: boolean }) {
  const draft = useStudioStore((s) => s.poseEdit);
  const probe = useStudioStore((s) => s.poseProbe);
  const stop = useStudioStore((s) => s.stopPoseEdit);
  const setKeyframe = useStudioStore((s) => s.setPoseKeyframe);
  const updatePose = useStudioStore((s) => s.updatePose);
  const setOptions = useStudioStore((s) => s.setPoseEditOptions);
  const duplicatePose = useStudioStore((s) => s.duplicatePose);
  const removePose = useStudioStore((s) => s.removePose);
  const movePose = useStudioStore((s) => s.movePose);
  const playing = useStudioStore((s) => s.playing);
  const togglePlaying = useStudioStore((s) => s.togglePlaying);
  const [tab, setTab] = useState<Tab>("body");

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

  const change = (path: string, value: number) => {
    let next = setPoseValue(pose, path, value);
    const other = draft.mirror ? mirrorPath(path) : null;
    if (other) next = setPoseValue(next, other, value);
    updatePose(i, next);
  };
  const togglePin = (id: AnchorId) => {
    const anchors = { ...(pose.anchors ?? {}) };
    if (anchors[id]) delete anchors[id];
    else if (probe[id]) anchors[id] = probe[id];
    else return;
    updatePose(i, { ...pose, anchors });
  };
  const label = draft.sourceSeq ? `Edited from #${draft.sourceSeq}` : "Pose editor";
  const pinned = (id: AnchorId) => Boolean(pose.anchors?.[id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: title, play, close */}
      <div className="flex items-center justify-between border-b border-(--m3-outline-variant) px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">Pose editor</div>
          <h2 className="truncate text-sm font-semibold tracking-tight">{label}</h2>
        </div>
        <div className="flex items-center gap-1">
          <M3Button size="sm" variant={playing ? "tonal" : "filled"} onClick={togglePlaying} title={playing ? "Pause and hold the selected pose" : "Play the loop"}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Pause" : "Play"}
          </M3Button>
          <IconButton label="Close the editor (discard changes)" onClick={stop} disabled={saving} className="h-8 w-8">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="studio-scroll min-h-0 flex-1 overflow-y-auto">
        {/* Pose strip */}
        <div className="border-b border-(--m3-outline-variant) px-4 py-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {draft.poses.map((_, k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKeyframe(k)}
                className={cn(
                  "studio-state flex h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border px-2 text-xs font-semibold tabular-nums",
                  k === i
                    ? "border-transparent bg-(--m3-primary) text-(--m3-on-primary) shadow-[var(--studio-glow)]"
                    : "border-(--m3-outline-variant) bg-(--m3-surface-container) text-(--m3-on-surface-variant)",
                )}
                title={`Pose ${k + 1}`}
              >
                {k + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={() => duplicatePose(i)}
              disabled={n >= 8}
              className="studio-state flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-(--m3-outline) text-(--m3-primary) disabled:opacity-40"
              title="Add a pose after this one (a copy of it)"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-(--m3-on-surface-variant)">
            <span className="mr-auto">
              Pose {i + 1} of {n}
            </span>
            <IconButton label="Move this pose earlier" onClick={() => movePose(i, -1)} disabled={i === 0} className="h-7 w-7">
              <ChevronLeft className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Move this pose later" onClick={() => movePose(i, 1)} disabled={i === n - 1} className="h-7 w-7">
              <ChevronRight className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Duplicate this pose" onClick={() => duplicatePose(i)} disabled={n >= 8} className="h-7 w-7">
              <Copy className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Remove this pose" onClick={() => removePose(i)} disabled={n <= 1} className="h-7 w-7">
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Segmented
              value={draft.mode}
              onChange={(mode) => setOptions({ mode })}
              size="sm"
              options={LOOP_MODES.map((m) => ({ value: m, label: LOOP_LABEL[m].label, title: LOOP_LABEL[m].title }))}
            />
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-(--m3-on-surface-variant)" title="Seconds of one loop">
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                value={draft.durationS}
                onChange={(e) => setOptions({ durationS: Math.max(0.5, Number(e.target.value) || 0.5) })}
                className="h-7 w-14 rounded-lg border border-(--m3-outline-variant) bg-(--m3-surface-container) px-1.5 text-right font-mono text-[11px] text-(--m3-on-surface) outline-none focus-visible:border-(--m3-primary)"
              />
              s
            </label>
          </div>
        </div>

        {/* Pins */}
        <div className="border-b border-(--m3-outline-variant) px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">
            <span>Pinned in this pose</span>
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
          <p className="mt-2 text-[11px] leading-snug text-(--m3-on-surface-variant)">
            In the viewport, click a dot on a hand, foot, knee or the hips and drag it: the limb follows inside its range of motion and the sliders update.
            {draft.dragTarget ? ` Dragging: ${draft.dragTarget === "hips" ? "hips" : ANCHOR_LABEL[draft.dragTarget as AnchorId]}.` : ""}
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
                <div className="grid grid-cols-2 gap-3">
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
                  <label className="flex items-end text-[11px] text-(--m3-on-surface-variant)">
                    <Chip selected={draft.twoHanded} onClick={() => setOptions({ twoHanded: !draft.twoHanded })} title="The hands hold a bar: its position per pose drives the arms" className="h-8 w-full justify-center">
                      Bar in both hands
                    </Chip>
                  </label>
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
                      title="Automatic: from the legs when standing (feet on the floor), else the support's default. Off: the slider sets it."
                      className="h-6 normal-case tracking-normal"
                    >
                      Auto height
                    </Chip>
                  </div>
                  <Sliders fields={group("hips").fields} pose={pose} onChange={change} />
                </div>
                <div className="rounded-2xl bg-(--m3-surface-container) p-3">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">Torso & head</div>
                  <Sliders fields={group("torso").fields} pose={pose} onChange={change} />
                </div>
              </div>
            ) : null}
            {tab === "arms" || tab === "legs" ? (
              <div className="grid grid-cols-2 gap-3">
                {(["left", "right"] as const).map((side) => (
                  <div key={side} className="rounded-2xl bg-(--m3-surface-container) p-3">
                    <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">
                      {side} {tab === "arms" ? "arm" : "leg"}
                    </div>
                    <Sliders fields={group(`${side}_${tab === "arms" ? "arm" : "leg"}`).fields} pose={pose} onChange={change} compact />
                  </div>
                ))}
              </div>
            ) : null}
            {tab === "bar" ? (
              <div className="rounded-2xl bg-(--m3-surface-container) p-3">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">Bar position in this pose</div>
                <Sliders fields={group("implement").fields} pose={pose} onChange={change} />
                <p className="mt-2 text-[11px] leading-snug text-(--m3-on-surface-variant)">
                  The arms are solved to reach the bar with the catalog grip; the shoulder and elbow sliders only steer where the elbows point.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-(--m3-outline-variant) px-4 py-3">
        <M3Button variant="text" onClick={stop} disabled={saving}>
          Discard
        </M3Button>
        <M3Button variant="filled" onClick={() => void onSave(poseClipFromDraft(draft), label)} busy={saving} disabled={!draft.dirty && draft.vectorId !== null}>
          <Save className="h-4 w-4" /> Save as new version
        </M3Button>
      </div>
    </div>
  );
}
