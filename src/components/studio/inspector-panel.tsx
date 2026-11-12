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
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { useStudioStore } from "@/lib/studio/store";
import { relativeTime } from "@/lib/studio/format";
import { defaultEquipmentItems, equipmentSentence, fillPromptTemplate } from "@/lib/studio/prompt";
import type { BaseAvatar, EquipmentItem, MovementVector, StudioExercise, StudioSettings } from "@/lib/studio/types";
import { VECTOR_STATUS_LABEL } from "@/lib/studio/types";
import type { GuideFocus } from "@/lib/studio/load-state";
import { cn } from "@/lib/utils";
import { ClipProblemNote } from "./clip-problem-note";
import { useClipProblem } from "./hooks/use-clip-problems";
import { ErrorState } from "./load-states";
import { PickExerciseGuide } from "./pick-exercise-guide";
import { Chip, Field, IconButton, M3Button, NumberField, Section, Select, StatusDot, TextArea } from "./ui";

export type GenerateInput = {
  prompt: string;
  items: EquipmentItem[];
  params: { fps: number; duration_s: number; loop: boolean; loop_mode?: "cycle" | "pingpong"; model?: string };
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
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <Chip tone={item.kind === "load" ? "primary" : "neutral"} className="h-6 px-2">
          {item.kind}
        </Chip>
        <Select
          value={item.code}
          onChange={(e) => onChange({ ...item, code: e.target.value })}
          className="h-8 py-0 pl-2.5 text-xs"
          aria-label="Equipment code"
          title={item.code}
        >
          {!codes.includes(item.code) ? <option value={item.code}>{item.code}</option> : null}
          {codes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
        <IconButton label="Remove" onClick={onRemove} className="h-8 w-8">
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      {item.kind === "load" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-1 text-[11px] text-(--m3-on-surface-variant)">
          <label className="flex min-w-0 flex-1 basis-24 items-center gap-1.5" title="Where the item is held">
            on
            <Select
              value={item.socket_b ? BOTH_HANDS : (item.socket ?? "")}
              onChange={(e) => {
                const value = e.target.value;
                if (value === BOTH_HANDS) onChange({ ...item, socket: "hand_r", socket_b: "hand_l" });
                else onChange({ ...item, socket: value || undefined, socket_b: undefined });
              }}
              className="h-7 min-w-0 py-0 pl-2.5 pr-2 text-[11px]"
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
          </label>
          <label className="flex items-center gap-1" title="How many of this item (two dumbbells, …)">
            count
            <NumberField aria-label="Count" min={1} max={20} step={1} value={item.count ?? 1} onCommit={(v) => onChange({ ...item, count: Math.round(v) })} className="h-7 w-11 px-1 py-0 text-[11px]" />
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
              className="h-7 w-12 px-1 py-0 text-[11px]"
            />
          </label>
        </div>
      ) : (
        <div className="pl-1 text-[11px] text-(--m3-on-surface-variant)">Stands on the floor</div>
      )}
    </li>
  );
}

/** One queue / history entry with the actions its status allows. */
function VectorRow({
  vector,
  selected,
  busy,
  onSelect,
  onEdit,
  onAction,
}: {
  vector: MovementVector;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  /** The edit control: a pose clip opens in the editor, a capture as key poses. */
  onEdit: () => void;
  onAction: (action: VectorAction, payload?: File | string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState(vector.prompt);
  const ready = vector.status === "ready";
  const running = vector.status === "processing";
  const queued = vector.status === "pending";
  // A file found not to load, or a .json without poses: said on the row, and no edit control that leads nowhere.
  const problem = useClipProblem(vector);
  return (
    <li
      className={cn(
        "rounded-xl transition-colors",
        selected ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "bg-(--m3-surface-container)",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title={ready ? (vector.format === "json" ? `Open #${vector.seq} on the stage to adjust its poses` : `Play #${vector.seq} on the stage`) : undefined}
        className="studio-state flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 pt-2.5 pb-1.5 text-left">
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
          <p className="mt-1 text-[11px] leading-snug text-(--m3-on-surface-variant)">
            {vector.error ? vector.error : vector.prompt}
          </p>
          {ready && problem ? <ClipProblemNote problem={problem} className="mt-1" /> : null}
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
        {ready && !problem ? (
          <IconButton label={vector.format === "json" ? `Open the poses of #${vector.seq} in the editor` : `Edit capture #${vector.seq} as key poses (the capture stays as it is)`} onClick={onEdit} disabled={busy} className="h-7 w-7" data-vector-edit={vector.id}>
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
  vectorsFailed,
  onRetryVectors,
  guide,
  equipmentCodes,
  supportCodes,
  generating,
  busyVectorId,
  onGenerate,
  onVectorAction,
  onUploadClip,
  onOpenVector,
  onEditVector,
}: {
  exercise: StudioExercise | null;
  avatar: BaseAvatar | null;
  settings: StudioSettings | null;
  vectors: MovementVector[];
  vectorsLoading: boolean;
  /** The clips request failed (its error), shown with Retry instead of "no generation yet". */
  vectorsFailed?: unknown;
  onRetryVectors: () => unknown;
  /** What the three-step guide puts first while no exercise is open (loading, a failed list, no avatar). */
  guide?: GuideFocus;
  equipmentCodes: string[];
  supportCodes: string[];
  generating: boolean;
  busyVectorId: string | null;
  onGenerate: (input: GenerateInput) => Promise<void>;
  onVectorAction: (vector: MovementVector, action: VectorAction, payload?: File | string) => Promise<void>;
  /** A clip file as a new ready row (a DeepMotion / SayMotion / Mixamo export). */
  onUploadClip: (file: File, items: EquipmentItem[]) => Promise<void>;
  /** A row was picked: a ready pose clip opens in the editor, another ready clip plays, a queued row is selected. */
  onOpenVector: (vector: MovementVector) => void;
  /** The edit control of a ready row: a pose clip opens in the editor, a capture as key poses. */
  onEditVector: (vector: MovementVector) => void;
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
  const [model, setModel] = useState<string>(typeof settings?.pipeline.model === "string" ? settings.pipeline.model : "");
  const [showPrompt, setShowPrompt] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploadingClip, setUploadingClip] = useState(false);
  const clipInput = useRef<HTMLInputElement>(null);

  const setPreviewItems = useStudioStore((s) => s.setPreviewItems);
  const vectorId = useStudioStore((s) => s.vectorId);

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
    return <PickExerciseGuide focus={guide} />;
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
          <p className="mt-3 text-xs leading-relaxed text-(--m3-on-surface-variant)">{exercise.description}</p>
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
          <div className="grid grid-cols-2 gap-2">
            <Field label="FPS">
              <NumberField min={1} max={240} step={1} value={fps} onCommit={(v) => setFps(Math.round(v))} />
            </Field>
            <Field label="Seconds">
              <NumberField min={0.5} max={60} step={0.5} digits={1} value={duration} onCommit={setDuration} />
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
          Generate movement
        </M3Button>
        {avatar ? null : <p className="-mt-2 text-center text-[11px] text-(--m3-on-surface-variant)">Needs an avatar: create the mannequin on the stage.</p>}

        <Section
          title="Queue & history"
          meta={
            vectors.length ? (
              <span className="rounded-full bg-(--m3-surface-container-high) px-1.5 text-[11px] tabular-nums text-(--m3-on-surface-variant)" aria-label={`${vectors.length} rows`}>
                {vectors.length}
              </span>
            ) : null
          }
          action={
            <>
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
            </>
          }
        >
          {vectorsFailed && !vectors.length ? (
            <ErrorState className="py-2" title="The clips of this exercise did not load." error={vectorsFailed} onRetry={onRetryVectors} />
          ) : vectorsLoading && !vectors.length ? (
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
                  onSelect={() => onOpenVector(vector)}
                  onEdit={() => onEditVector(vector)}
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
