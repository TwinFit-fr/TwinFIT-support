"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Upload, Wand2 } from "lucide-react";
import { useStudioStore } from "@/lib/studio/store";
import { defaultEquipmentItems, equipmentSentence, fillPromptTemplate } from "@/lib/studio/prompt";
import type { BaseAvatar, EquipmentItem, MovementVector, StudioExercise, StudioSettings } from "@/lib/studio/types";
import type { GuideFocus } from "@/lib/studio/load-state";
import { cn } from "@/lib/utils";
import { ErrorState } from "./load-states";
import { PickExerciseGuide } from "./pick-exercise-guide";
import { Chip, Field, M3Button, NumberField, Section, Select, TextArea } from "./ui";
import { ItemRow } from "./item-row";
import { VectorRow, type VectorAction } from "./vector-row";

export type { VectorAction } from "./vector-row";

export type GenerateInput = {
  prompt: string;
  items: EquipmentItem[];
  params: { fps: number; duration_s: number; loop: boolean; loop_mode?: "cycle" | "pingpong"; model?: string };
};

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
