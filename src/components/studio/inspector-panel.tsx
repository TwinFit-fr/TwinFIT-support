"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  OctagonX,
  PenLine,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { useStudioStore } from "@/lib/studio/store";
import { relativeTime } from "@/lib/studio/format";
import { defaultEquipmentItems, equipmentSentence, fillPromptTemplate } from "@/lib/studio/prompt";
import type { BaseAvatar, EquipmentItem, MovementVector, StudioExercise, StudioSettings } from "@/lib/studio/types";
import { VECTOR_STATUS_LABEL } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { Chip, EmptyState, Field, IconButton, M3Button, NumberField, Section, Select, StatusDot, TextArea } from "./ui";

export type GenerateInput = {
  prompt: string;
  items: EquipmentItem[];
  params: { fps: number; duration_s: number; loop: boolean; loop_mode?: "cycle" | "pingpong"; pose_count?: number; model?: string };
};

/** stop = mark a queued / running row failed; prompt = change a queued row's prompt (payload: the text). */
export type VectorAction = "activate" | "deactivate" | "requeue" | "upload" | "delete" | "edit" | "stop" | "prompt";

/** Select value for an item held with both hands (socket hand_r + socket_b hand_l). */
const BOTH_HANDS = "__both__";

function ItemRow({
  item,
  sockets,
  codes,
  onChange,
  onRemove,
}: {
  item: EquipmentItem;
  sockets: string[];
  codes: string[];
  onChange: (next: EquipmentItem) => void;
  onRemove: () => void;
}) {
  return (
    <li className="space-y-1.5 rounded-xl bg-(--m3-surface-container) p-2">
      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
        <Chip tone={item.kind === "load" ? "primary" : "neutral"} className="h-6 px-2">
          {item.kind}
        </Chip>
        <Select
          value={item.code}
          onChange={(e) => onChange({ ...item, code: e.target.value })}
          className="h-8 py-0 text-xs"
          aria-label="Equipment code"
        >
          {!codes.includes(item.code) ? <option value={item.code}>{item.code}</option> : null}
          {codes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
        {item.kind === "load" ? (
          <Select
            value={item.socket_b ? BOTH_HANDS : (item.socket ?? "")}
            onChange={(e) => {
              const value = e.target.value;
              if (value === BOTH_HANDS) onChange({ ...item, socket: "hand_r", socket_b: "hand_l" });
              else onChange({ ...item, socket: value || undefined, socket_b: undefined });
            }}
            className="h-8 w-28 py-0 text-xs"
            aria-label="Socket"
          >
            <option value="">no socket</option>
            {sockets.includes("hand_l") && sockets.includes("hand_r") ? <option value={BOTH_HANDS}>both hands</option> : null}
            {sockets.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </Select>
        ) : (
          <span className="w-28 text-center text-[11px] text-(--m3-on-surface-variant)">floor</span>
        )}
        <IconButton label="Remove" onClick={onRemove} className="h-8 w-8">
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      {item.kind === "load" ? (
        <div className="flex items-center gap-3 pl-1 text-[10px] text-(--m3-on-surface-variant)">
          <label className="flex items-center gap-1" title="How many of this item (two dumbbells, …)">
            count
            <NumberField aria-label="Count" min={1} max={20} step={1} value={item.count ?? 1} onCommit={(v) => onChange({ ...item, count: Math.round(v) })} className="h-6 w-12 px-1 py-0 text-[11px]" />
          </label>
          <label className="flex items-center gap-1" title="Load in kilograms (a hint for the prompt; 0 = unspecified)">
            kg
            <NumberField
              aria-label="Weight in kilograms"
              min={0}
              max={1000}
              step={0.5}
              digits={1}
              value={item.weight_kg ?? 0}
              onCommit={(v) => onChange({ ...item, weight_kg: v > 0 ? v : undefined })}
              className="h-6 w-14 px-1 py-0 text-[11px]"
            />
          </label>
        </div>
      ) : null}
    </li>
  );
}

/** One queue / history entry with the actions its status allows. */
function VectorRow({
  vector,
  selected,
  busy,
  onSelect,
  onAction,
}: {
  vector: MovementVector;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onAction: (action: VectorAction, payload?: File | string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState(vector.prompt);
  const ready = vector.status === "ready";
  const running = vector.status === "processing";
  const queued = vector.status === "pending";
  return (
    <li
      className={cn(
        "rounded-xl transition-colors",
        selected ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "bg-(--m3-surface-container)",
      )}
    >
      <button type="button" onClick={onSelect} aria-pressed={selected} className="studio-state flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 pt-2.5 pb-1.5 text-left">
        <StatusDot status={vector.status} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono tabular-nums opacity-70">#{vector.seq}</span>
            <span className="font-medium">{VECTOR_STATUS_LABEL[vector.status]}</span>
            {vector.active ? (
              <Chip tone="success" className="h-5 px-1.5 text-[10px]">
                active
              </Chip>
            ) : null}
            <span className="ml-auto flex items-center gap-1 text-[10px] text-(--m3-on-surface-variant)">
              <Clock3 className="h-3 w-3" /> {relativeTime(vector.inserted_at)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-(--m3-on-surface-variant)">
            {vector.error ? vector.error : vector.prompt}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-(--m3-on-surface-variant)">
            <span>{vector.avatar?.code ?? "avatar"}</span>
            <span>· {vector.format}</span>
            {vector.fps ?? vector.params.fps ? <span>· {String(vector.fps ?? vector.params.fps)} fps</span> : null}
            {vector.duration_ms ? (
              <span>· {(vector.duration_ms / 1000).toFixed(1)} s</span>
            ) : vector.params.duration_s ? (
              <span>· {String(vector.params.duration_s)} s</span>
            ) : null}
            {vector.attempts > 1 ? <span>· attempt {vector.attempts}</span> : null}
            {vector.model ? <span>· {vector.model}</span> : null}
          </div>
        </div>
      </button>
      {editingPrompt ? (
        <div className="space-y-1.5 px-3 pb-2">
          <TextArea rows={3} value={promptText} onChange={(e) => setPromptText(e.target.value)} aria-label="Prompt of this queued row" className="text-[11px]" />
          <div className="flex justify-end gap-1">
            <M3Button size="sm" variant="text" onClick={() => setEditingPrompt(false)}>
              Cancel
            </M3Button>
            <M3Button
              size="sm"
              variant="tonal"
              disabled={!promptText.trim() || promptText.trim() === vector.prompt}
              onClick={() => {
                onAction("prompt", promptText);
                setEditingPrompt(false);
              }}
            >
              Save prompt
            </M3Button>
          </div>
        </div>
      ) : null}
      <div className="flex items-center gap-0.5 px-2 pb-1.5">
        {busy ? <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin text-(--m3-on-surface-variant)" /> : null}
        {ready ? (
          <IconButton
            label={vector.active ? "Stop using this clip" : "Use this clip for the exercise"}
            active={vector.active}
            onClick={() => onAction(vector.active ? "deactivate" : "activate")}
            disabled={busy}
            className="h-7 w-7"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {ready && vector.format === "json" ? (
          <IconButton label="Edit the poses of this clip (Save overwrites it; Save as copy keeps it)" onClick={() => onAction("edit")} disabled={busy} className="h-7 w-7">
            <PenLine className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {queued ? (
          <IconButton label="Edit the prompt before it runs" onClick={() => setEditingPrompt((v) => !v)} disabled={busy} className="h-7 w-7">
            <PenLine className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {vector.status === "error" ? (
          <IconButton label="Put back in the queue" onClick={() => onAction("requeue")} disabled={busy} className="h-7 w-7">
            <RotateCw className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {queued || running ? (
          <IconButton label={running ? "Stop: mark this run failed (a worker that died, or one you do not want to wait for)" : "Take it out of the queue (marked failed; delete it after)"} onClick={() => onAction("stop")} disabled={busy} className="h-7 w-7">
            <OctagonX className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {!running ? (
          <>
            <IconButton
              label={
                ready
                  ? "Replace the clip with a file (.glb, .gltf, .fbx, .bvh, .json)"
                  : "Attach a finished clip (.glb, .gltf, .fbx, .bvh, .json): a DeepMotion or Mixamo export is retargeted to the avatar"
              }
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="h-7 w-7"
            >
              <Upload className="h-3.5 w-3.5" />
            </IconButton>
            <input
              ref={fileInput}
              type="file"
              accept=".glb,.gltf,.fbx,.bvh,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onAction("upload", file);
              }}
            />
          </>
        ) : null}
        {!vector.active && !running ? (
          <IconButton label="Delete" onClick={() => onAction("delete")} disabled={busy} className="ml-auto h-7 w-7">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
      </div>
    </li>
  );
}

const POSE_COUNTS = ["auto", "2", "3", "4", "5", "6"] as const;

/**
 * Generator and inspector of the selected exercise. Draft state is local (remounted per exercise
 * through the `key` the workspace sets); only the equipment preview is pushed to the store.
 */
export function InspectorPanel({
  exercise,
  avatar,
  settings,
  vectors,
  vectorsLoading,
  equipmentCodes,
  supportCodes,
  generating,
  busyVectorId,
  onGenerate,
  onVectorAction,
  onUploadClip,
  onNewPoses,
}: {
  exercise: StudioExercise | null;
  avatar: BaseAvatar | null;
  settings: StudioSettings | null;
  vectors: MovementVector[];
  vectorsLoading: boolean;
  equipmentCodes: string[];
  supportCodes: string[];
  generating: boolean;
  busyVectorId: string | null;
  onGenerate: (input: GenerateInput) => Promise<void>;
  onVectorAction: (vector: MovementVector, action: VectorAction, payload?: File | string) => Promise<void>;
  /** A clip file as a new ready row (a DeepMotion / SayMotion / Mixamo export). */
  onUploadClip: (file: File, items: EquipmentItem[]) => Promise<void>;
  /** Open the pose editor on a clip started from one neutral pose, for this exercise. */
  onNewPoses: (items: EquipmentItem[]) => void;
}) {
  const sockets = useMemo(() => avatar?.sockets ?? [], [avatar]);
  const socketIds = useMemo(() => sockets.map((s) => s.id), [sockets]);
  const [userPrompt, setUserPrompt] = useState("");
  const [items, setItems] = useState<EquipmentItem[]>(() => (exercise ? defaultEquipmentItems(exercise, sockets) : []));
  const [fps, setFps] = useState<number>(Number(settings?.pipeline.fps ?? 30));
  const [duration, setDuration] = useState<number>(Number(settings?.pipeline.duration_s ?? 4));
  const [loop, setLoop] = useState<boolean>(settings?.pipeline.loop !== false);
  const [loopMode, setLoopMode] = useState<"auto" | "pingpong" | "cycle">(
    settings?.pipeline.loop_mode === "cycle" || settings?.pipeline.loop_mode === "pingpong" ? settings.pipeline.loop_mode : "auto",
  );
  const [poseCount, setPoseCount] = useState<(typeof POSE_COUNTS)[number]>(
    typeof settings?.pipeline.pose_count === "number" ? (String(settings.pipeline.pose_count) as (typeof POSE_COUNTS)[number]) : "auto",
  );
  const [model, setModel] = useState<string>(typeof settings?.pipeline.model === "string" ? settings.pipeline.model : "");
  const [showPrompt, setShowPrompt] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploadingClip, setUploadingClip] = useState(false);
  const clipInput = useRef<HTMLInputElement>(null);

  const setPreviewItems = useStudioStore((s) => s.setPreviewItems);
  const vectorId = useStudioStore((s) => s.vectorId);
  const setVector = useStudioStore((s) => s.setVector);

  useEffect(() => {
    setPreviewItems(items);
  }, [items, setPreviewItems]);

  const finalPrompt = useMemo(() => {
    if (!exercise) return "";
    return fillPromptTemplate(settings?.prompt_template ?? "{exercise_name}. {user_prompt}", {
      subject: avatar?.subject ?? "neutral",
      exercise_name: exercise.display_name,
      exercise_description: exercise.description,
      equipment: equipmentSentence(items),
      user_prompt: userPrompt.trim(),
    });
  }, [exercise, settings, avatar, items, userPrompt]);

  if (!exercise) {
    return (
      <EmptyState
        icon={<Sparkles className="h-5 w-5" />}
        title="Pick an exercise"
        body="Choose a catalog exercise on the left to describe its movement and generate a clip for the avatar."
      />
    );
  }

  const canGenerate = Boolean(avatar) && finalPrompt.length > 0 && !generating;
  const generate = () =>
    onGenerate({
      prompt: finalPrompt,
      items,
      params: {
        fps,
        duration_s: duration,
        loop,
        ...(loopMode !== "auto" ? { loop_mode: loopMode } : {}),
        ...(poseCount !== "auto" ? { pose_count: Number(poseCount) } : {}),
        ...(model.trim() ? { model: model.trim() } : {}),
      },
    });

  return (
    <div className="studio-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-(--m3-outline-variant) px-4 py-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">
          Exercise #{exercise.exo_id}
        </div>
        <h2 className="mt-1 text-lg font-semibold leading-tight tracking-tight">{exercise.display_name}</h2>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {exercise.group ? <Chip>{exercise.group.name}</Chip> : null}
          {exercise.target_muscle ? <Chip>{exercise.target_muscle.name}</Chip> : null}
          {exercise.movement_type ? <Chip>{exercise.movement_type.name}</Chip> : null}
          {exercise.equipment && exercise.equipment.code !== "NONE" ? (
            <Chip tone="primary">{exercise.equipment.name}</Chip>
          ) : null}
          {exercise.support_equipment ? <Chip tone="primary">{exercise.support_equipment.name}</Chip> : null}
        </div>
        {exercise.description ? (
          <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-(--m3-on-surface-variant)">{exercise.description}</p>
        ) : null}
      </div>

      <div className="space-y-3 p-3">
        <Section title="Movement prompt">
          <TextArea
            rows={4}
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            aria-label="Movement prompt"
            placeholder="Describe tempo, range of motion, stance, breathing cues… The exercise, its description and the equipment are added for you."
          />
          <button
            type="button"
            onClick={() => setShowPrompt((v) => !v)}
            aria-expanded={showPrompt}
            className="mt-2 flex cursor-pointer items-center gap-1 text-[11px] text-(--m3-primary)"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showPrompt && "rotate-180")} />
            {showPrompt ? "Hide" : "Show"} the final prompt
          </button>
          {showPrompt ? (
            <p className="mt-2 rounded-xl bg-(--m3-surface-container) p-3 font-mono text-[11px] leading-relaxed text-(--m3-on-surface-variant)">
              {finalPrompt}
            </p>
          ) : null}
        </Section>

        <Section
          title="Equipment & sockets"
          action={
            <div className="flex gap-1">
              <M3Button
                size="sm"
                variant="text"
                onClick={() =>
                  setItems((list) => [
                    ...list,
                    { kind: "load", code: equipmentCodes[0] ?? "DUMBBELL", socket: socketIds[0], count: 1 },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" /> load
              </M3Button>
              <M3Button
                size="sm"
                variant="text"
                onClick={() => setItems((list) => [...list, { kind: "support", code: supportCodes[0] ?? "BENCH" }])}
              >
                <Plus className="h-3.5 w-3.5" /> support
              </M3Button>
            </div>
          }
        >
          {items.length ? (
            <ul className="space-y-1.5">
              {items.map((item, index) => (
                <ItemRow
                  key={`${index}-${item.kind}`}
                  item={item}
                  sockets={socketIds}
                  codes={item.kind === "load" ? equipmentCodes : supportCodes}
                  onChange={(next) => setItems((list) => list.map((it, i) => (i === index ? next : it)))}
                  onRemove={() => setItems((list) => list.filter((_, i) => i !== index))}
                />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-(--m3-on-surface-variant)">Bodyweight: nothing in the hands, nothing on the floor.</p>
          )}
          {!socketIds.length ? (
            <p className="mt-2 text-[11px] text-(--m3-warning)">This avatar has no sockets: load items are drawn at its root.</p>
          ) : null}
        </Section>

        <Section title="Pipeline">
          <div className="grid grid-cols-3 gap-2">
            <Field label="FPS">
              <NumberField min={1} max={240} step={1} value={fps} onCommit={(v) => setFps(Math.round(v))} />
            </Field>
            <Field label="Seconds">
              <NumberField min={0.5} max={60} step={0.5} digits={1} value={duration} onCommit={setDuration} />
            </Field>
            <Field label="Poses">
              <Select value={poseCount} onChange={(e) => setPoseCount(e.target.value as (typeof POSE_COUNTS)[number])} title="How many key poses the AI drafts">
                {POSE_COUNTS.map((k) => (
                  <option key={k} value={k}>
                    {k === "auto" ? "auto" : `${k} poses`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-(--m3-on-surface-variant)">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              className="h-4 w-4 accent-(--m3-primary)"
            />
            Seamless loop (ends in the start position)
          </label>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="mt-2 flex cursor-pointer items-center gap-1 text-[11px] text-(--m3-primary)"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")} />
            Advanced
          </button>
          {showAdvanced ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Loop shape" hint="Boomerang: there and back; cycle: last pose returns to the first">
                <Select value={loopMode} onChange={(e) => setLoopMode(e.target.value as typeof loopMode)} disabled={!loop}>
                  <option value="auto">model&apos;s choice</option>
                  <option value="pingpong">boomerang</option>
                  <option value="cycle">cycle</option>
                </Select>
              </Field>
              <Field label="Model" hint="OpenAI model that drafts the poses (empty = default)">
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-5-mini"
                  className="w-full rounded-xl border border-(--m3-outline) bg-(--m3-surface-container-high) px-3.5 py-2.5 text-sm text-(--m3-on-surface) outline-none focus:border-(--m3-primary)"
                />
              </Field>
            </div>
          ) : null}
        </Section>

        <M3Button variant="filled" size="lg" className="w-full" disabled={!canGenerate} busy={generating} onClick={generate}>
          <Wand2 className="h-4 w-4" />
          {avatar ? "Generate movement" : "Upload an avatar first"}
        </M3Button>

        <Section
          title="Queue & history"
          action={
            <div className="flex items-center gap-2">
              <M3Button size="sm" variant="text" disabled={!avatar} onClick={() => onNewPoses(items)} title="Build the movement by hand: start from one pose, add the next ones, play them as a loop">
                <PenLine className="h-3.5 w-3.5" /> New poses
              </M3Button>
              <M3Button
                size="sm"
                variant="text"
                disabled={!avatar || uploadingClip}
                busy={uploadingClip}
                onClick={() => clipInput.current?.click()}
                title="Add a clip file as a ready movement: a DeepMotion, SayMotion or Mixamo export (.fbx, .bvh, .glb) is retargeted to the avatar"
              >
                <Upload className="h-3.5 w-3.5" /> Upload clip
              </M3Button>
              <input
                ref={clipInput}
                type="file"
                accept=".glb,.gltf,.fbx,.bvh,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setUploadingClip(true);
                  void onUploadClip(file, items).finally(() => setUploadingClip(false));
                }}
              />
              <span className="text-[11px] tabular-nums text-(--m3-on-surface-variant)">{vectors.length}</span>
            </div>
          }
        >
          {vectorsLoading && !vectors.length ? (
            <div className="space-y-1.5">
              {[0, 1].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-(--m3-surface-container)" />
              ))}
            </div>
          ) : vectors.length ? (
            <ul className="space-y-1.5">
              {vectors.map((vector) => (
                <VectorRow
                  key={vector.id}
                  vector={vector}
                  selected={vector.id === vectorId}
                  busy={busyVectorId === vector.id}
                  onSelect={() => setVector(vector.id === vectorId ? null : vector.id)}
                  onAction={(action, payload) => void onVectorAction(vector, action, payload)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-(--m3-on-surface-variant)">No generation yet for this exercise.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
