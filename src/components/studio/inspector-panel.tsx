"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { useStudioStore } from "@/lib/studio/store";
import { defaultEquipmentItems, equipmentSentence, fillPromptTemplate } from "@/lib/studio/prompt";
import type {
  BaseAvatar,
  EquipmentItem,
  MovementVector,
  StudioExercise,
  StudioSettings,
  VectorFormat,
} from "@/lib/studio/types";
import { VECTOR_FORMATS, VECTOR_STATUS_LABEL } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { Chip, EmptyState, Field, IconButton, M3Button, Section, Select, StatusDot, TextArea, TextInput } from "./ui";

export type GenerateInput = {
  prompt: string;
  items: EquipmentItem[];
  params: { fps: number; duration_s: number; loop: boolean };
  format: VectorFormat;
};

export type VectorAction = "activate" | "deactivate" | "requeue" | "upload" | "delete";

/** Select value for an item held with both hands (socket hand_r + socket_b hand_l). */
const BOTH_HANDS = "__both__";

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

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
    <li className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-xl bg-(--m3-surface-container) p-2">
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
  onAction: (action: VectorAction, file?: File) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const ready = vector.status === "ready";
  return (
    <li
      className={cn(
        "rounded-xl transition-colors",
        selected ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "bg-(--m3-surface-container)",
      )}
    >
      <button type="button" onClick={onSelect} className="studio-state flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 pt-2.5 pb-1.5 text-left">
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
        ) : (
          <>
            {vector.status === "error" ? (
              <IconButton label="Put back in the queue" onClick={() => onAction("requeue")} disabled={busy} className="h-7 w-7">
                <RotateCw className="h-3.5 w-3.5" />
              </IconButton>
            ) : null}
            <IconButton
              label="Attach a finished clip (.glb, .gltf, .bvh, .json)"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="h-7 w-7"
            >
              <Upload className="h-3.5 w-3.5" />
            </IconButton>
            <input
              ref={fileInput}
              type="file"
              accept=".glb,.gltf,.bvh,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onAction("upload", file);
              }}
            />
          </>
        )}
        {!vector.active ? (
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
  equipmentCodes,
  supportCodes,
  generating,
  busyVectorId,
  onGenerate,
  onVectorAction,
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
  onVectorAction: (vector: MovementVector, action: VectorAction, file?: File) => Promise<void>;
}) {
  const sockets = useMemo(() => avatar?.sockets ?? [], [avatar]);
  const socketIds = useMemo(() => sockets.map((s) => s.id), [sockets]);
  const [userPrompt, setUserPrompt] = useState("");
  const [items, setItems] = useState<EquipmentItem[]>(() =>
    exercise ? defaultEquipmentItems(exercise, sockets) : [],
  );
  const [fps, setFps] = useState<number>(Number(settings?.pipeline.fps ?? 30));
  const [duration, setDuration] = useState<number>(Number(settings?.pipeline.duration_s ?? 4));
  const [loop, setLoop] = useState<boolean>(settings?.pipeline.loop !== false);
  const [format, setFormat] = useState<VectorFormat>("glb");
  const [showPrompt, setShowPrompt] = useState(false);

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
            placeholder="Describe tempo, range of motion, stance, breathing cues… The exercise, its description and the equipment are added for you."
          />
          <button
            type="button"
            onClick={() => setShowPrompt((v) => !v)}
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
              <TextInput type="number" min={1} max={240} value={fps} onChange={(e) => setFps(Number(e.target.value))} />
            </Field>
            <Field label="Seconds">
              <TextInput
                type="number"
                min={0.5}
                max={60}
                step={0.5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </Field>
            <Field label="Format">
              <Select value={format} onChange={(e) => setFormat(e.target.value as VectorFormat)}>
                {VECTOR_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
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
        </Section>

        <M3Button
          variant="filled"
          size="lg"
          className="w-full"
          disabled={!canGenerate}
          busy={generating}
          onClick={() =>
            onGenerate({ prompt: finalPrompt, items, params: { fps, duration_s: duration, loop }, format })
          }
        >
          <Wand2 className="h-4 w-4" />
          {avatar ? "Generate movement" : "Upload an avatar first"}
        </M3Button>

        <Section
          title="Queue & history"
          action={<span className="text-[11px] tabular-nums text-(--m3-on-surface-variant)">{vectors.length}</span>}
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
                  onAction={(action, file) => void onVectorAction(vector, action, file)}
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
