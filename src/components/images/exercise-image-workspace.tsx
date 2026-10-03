"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Pencil, Trash2 } from "lucide-react";
import { Button, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  useGenerationQueue,
  usePositionSelection,
  useStyleChoice,
  useSubjectSelection,
} from "@/hooks/use-generation-queue";
import { ExerciseComposeDialog } from "@/components/catalog/exercise-compose-dialog";
import { GenerationProgress, processingSteps } from "@/components/images/generation-progress";
import { FramePlayer } from "@/components/images/frame-player";
import { ImageMetadataPanel } from "@/components/images/image-metadata";
import {
  NO_OVERRIDES,
  PromptOverridesPanel,
  countOverrides,
  type PromptOverrides,
} from "@/components/images/prompt-overrides";
import { selectedPrompts } from "@/lib/images/prompt";
import {
  PositionSelector,
  StyleSelector,
  SubjectSelector,
  runPositionsFor,
} from "@/components/images/position-selector";
import type {
  ExerciseImage,
  ExerciseImageDetail,
  ImagePrompt,
  ImageSettings,
  ImageStyle,
  Subject,
} from "@/lib/images/types";
import {
  FRAME_POSITIONS,
  MID_POSITION,
  SUBJECTS,
  framePositionLabel,
  isDeletableImage,
  targetPosition,
} from "@/lib/images/types";
import { gifPlaybackOrder, imageDisplayUrl, imageThumbUrl } from "@/lib/images/urls";
import { cn } from "@/lib/utils";

const SUBJECT_LABEL: Record<Subject, string> = {
  man: "Man",
  woman: "Woman",
};

function CheckerFrame({ src, alt, label }: { src: string | null; alt: string; label: string }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div
        className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100"
        style={{
          backgroundImage:
            "linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4e4e7 75%),linear-gradient(-45deg,transparent 75%,#e4e4e7 75%)",
          backgroundSize: "18px 18px",
          backgroundPosition: "0 0,0 9px,9px -9px,-9px 0",
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-sm text-zinc-400">Empty</span>
        )}
      </div>
    </div>
  );
}

function imageLabel(img: ExerciseImage): string {
  if (img.active) return `Pos ${img.position} · ${framePositionLabel(img.position)}`;
  const target = targetPosition(img);
  return target != null ? `${framePositionLabel(target)} · inactive` : "Inactive";
}

function SequencePreview({
  images,
  framePositions,
  label,
}: {
  images: ExerciseImage[];
  framePositions: number[];
  label: string;
}) {
  const frames = images
    .filter((img) => img.active && img.position != null && framePositions.includes(img.position))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((img) => ({ position: img.position as number, image_url: img.image_url }));
  const order = gifPlaybackOrder(frames.map((f) => f.position));

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-800">{label}</div>
        <div className="text-xs text-zinc-500">
          {frames.length}/{framePositions.length} active · loop {order.join("→") || "—"}
        </div>
      </div>
      <div
        className="aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100"
        style={{
          backgroundImage:
            "linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4e4e7 75%),linear-gradient(-45deg,transparent 75%,#e4e4e7 75%)",
          backgroundSize: "18px 18px",
          backgroundPosition: "0 0,0 9px,9px -9px,-9px 0",
        }}
      >
        <FramePlayer frames={frames} fallbackUrl={null} alt={label} width={800} />
      </div>
    </div>
  );
}

function SubjectLane({
  subject,
  images,
  framePositions,
}: {
  subject: Subject;
  images: ExerciseImage[];
  framePositions: number[];
}) {
  const subjectImages = images.filter((img) => img.subject === subject);
  const activeByPosition = new Map<number, ExerciseImage>();
  for (const img of subjectImages) {
    if (img.active && img.position != null) activeByPosition.set(img.position, img);
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
      <div className="text-sm font-semibold text-zinc-900">{SUBJECT_LABEL[subject]}</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {FRAME_POSITIONS.filter((frame) => framePositions.includes(frame.id)).map((frame) => {
          const img = activeByPosition.get(frame.id) ?? null;
          return (
            <CheckerFrame
              key={frame.id}
              src={imageDisplayUrl(img?.image_url)}
              alt={`${SUBJECT_LABEL[subject]} ${frame.label}`}
              label={`${frame.id} · ${frame.label}`}
            />
          );
        })}
        <SequencePreview
          images={subjectImages}
          framePositions={framePositions}
          label={`GIF preview · ${SUBJECT_LABEL[subject]}`}
        />
      </div>
    </div>
  );
}

export function ExerciseImageWorkspace({ exoId }: { exoId: number }) {
  const router = useRouter();
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const [positions, setPositions] = usePositionSelection();
  const [subjects, setSubjects] = useSubjectSelection();
  const { data: settings } = useStaffSWR<ImageSettings>("/api/images/settings");
  const { data: stylesData } = useStaffSWR<{ styles: ImageStyle[] }>("/api/images/styles");
  const styles = stylesData?.styles ?? [];
  const [styleId, setStyleId] = useStyleChoice(settings?.default_style_id ?? null);
  const style = styles.find((s) => s.id === styleId) ?? null;
  const detailKey = styleId ? `/api/images/exercises/${exoId}?style=${styleId}` : null;
  const listKey = styleId ? `/api/images/exercises?style=${styleId}` : null;
  const { data: promptsData } = useStaffSWR<{ prompts: ImagePrompt[] }>("/api/images/prompts");
  const queue = useGenerationQueue();
  const inFlight = queue.items.flatMap((item) =>
    processingSteps(item).map((step) => ({ step, subject: item.subject })),
  );
  const { data, isLoading, error } = useStaffSWR<{
    exercise: ExerciseImageDetail;
  }>(detailKey, { refreshInterval: 5000 });
  const exercise = data?.exercise;
  const [selectedChoice, setSelectedId] = useState<string | null>(null);
  const [historySubject, setHistorySubject] = useState<"all" | Subject>("all");
  // An unknown or deleted choice falls back to the newest image.
  const selectedId =
    exercise && !exercise.images.some((img) => img.id === selectedChoice)
      ? (exercise.images[0]?.id ?? null)
      : selectedChoice;
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);
  // Per-run edits belong to one exercise; they reset when navigating to another.
  const [overridesFor, setOverridesFor] = useState<{ exoId: number; value: PromptOverrides }>({
    exoId,
    value: NO_OVERRIDES,
  });
  const overrides = overridesFor.exoId === exoId ? overridesFor.value : NO_OVERRIDES;
  const setOverrides = (value: PromptOverrides) => setOverridesFor({ exoId, value });

  const templates = useMemo(() => {
    const prompts = promptsData?.prompts ?? [];
    const byPosition = FRAME_POSITIONS.map((f) => selectedPrompts(style, prompts, f.id));
    return {
      system:
        prompts.find((p) => p.id === overrides.systemPromptId && p.kind === "system")?.content ??
        byPosition[0].system?.content ??
        "",
      positions: Object.fromEntries(
        byPosition.map((chosen, i) => [FRAME_POSITIONS[i].id, chosen.position?.content ?? ""]),
      ) as Record<number, string>,
    };
  }, [promptsData, style, overrides.systemPromptId]);
  const systemPrompts = useMemo(
    () => (promptsData?.prompts ?? []).filter((p) => p.kind === "system"),
    [promptsData],
  );
  const framePositions = exercise?.frame_positions ?? FRAME_POSITIONS.map((f) => f.id as number);
  const runPositions = runPositionsFor(positions, framePositions);
  const editedCount = countOverrides(overrides, runPositions);

  const selected: ExerciseImage | null = useMemo(
    () => exercise?.images.find((img) => img.id === selectedId) ?? null,
    [exercise, selectedId],
  );

  const historyImages = useMemo(() => {
    const images = exercise?.images ?? [];
    if (historySubject === "all") return images;
    return images.filter((img) => img.subject === historySubject);
  }, [exercise, historySubject]);

  // Mid/End need a Start per selected subject: this run's or that subject's active one.
  const missingStartSubjects = useMemo(() => {
    if (runPositions.includes(0) || !exercise) return [];
    return subjects.filter((subject) => {
      const status = exercise.by_subject.find((s) => s.subject === subject);
      return !status?.active_positions.includes(0);
    });
  }, [exercise, runPositions, subjects]);
  const missingStart = missingStartSubjects.length > 0;

  const refresh = useCallback(async () => {
    if (detailKey) await mutate(detailKey);
    if (listKey) await mutate(listKey);
  }, [detailKey, listKey]);

  async function runGenerate() {
    if (!exercise || !styleId || queue.running || missingStart) return;
    const run = overrides;
    await queue.start({
      exercises: [
        {
          exoId: exercise.exo_id,
          name: exercise.display_name,
          framePositions: exercise.frame_positions,
        },
      ],
      positions: runPositions,
      subjects,
      maxConcurrency: settings?.max_concurrency ?? 3,
      generateStep: async (stepExoId, position, stepSubject, guideImageId) => {
        const { image } = (await staffFetch("/api/images/generate", {
          method: "POST",
          body: JSON.stringify({
            exoId: stepExoId,
            styleId,
            position,
            subject: stepSubject,
            systemOverride: run.system,
            systemPromptId: run.systemPromptId,
            positionOverride: run.positions[position],
            guideImageId,
          }),
        })) as { image: ExerciseImage };
        await refresh();
        return image.id;
      },
    });
  }

  async function toggleTwoFrames(next: boolean) {
    if (!exercise || !styleId) return;
    const hasActiveMid = exercise.by_subject.some((s) =>
      s.active_positions.includes(MID_POSITION),
    );
    if (
      next &&
      hasActiveMid &&
      !window.confirm("Use only Start and End? Active Mid frames will be deactivated.")
    ) {
      return;
    }
    setBusy(true);
    try {
      await staffFetch(`/api/images/exercises/${exercise.exo_id}?style=${styleId}`, {
        method: "PATCH",
        body: JSON.stringify({ two_frames: next }),
      });
      success(next ? "Two frames: Start + End" : "Three frames: Start + Mid + End");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function setPosition(imageId: string, position: number | null, active: boolean) {
    setBusy(true);
    try {
      await staffFetch(`/api/images/items/${imageId}`, {
        method: "PATCH",
        body: JSON.stringify({ position, active }),
      });
      success(active ? `Active at position ${position}` : "Deactivated");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(image: ExerciseImage | null) {
    if (!image || !isDeletableImage(image) || busy) return;
    if (!window.confirm(`Delete this ${imageLabel(image)} image permanently?`)) return;
    setBusy(true);
    try {
      await staffFetch(`/api/images/items/${image.id}`, { method: "DELETE" });
      success("Image deleted");
      if (selectedId === image.id) setSelectedId(null);
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (editOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        void runGenerate();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (!selected || !isDeletableImage(selected)) return;
        event.preventDefault();
        void removeImage(selected);
      } else if (event.key === "0" || event.key === "1" || event.key === "2") {
        // Activates the position on the selected image (its subject lane).
        if (!selected || !framePositions.includes(Number(event.key))) return;
        event.preventDefault();
        void setPosition(selected.id, Number(event.key), true);
      } else if (event.key === "x" || event.key === "X") {
        if (!selected) return;
        event.preventDefault();
        void setPosition(selected.id, null, false);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (!historyImages.length) return;
        const index = historyImages.findIndex((img) => img.id === selectedId);
        const next =
          event.key === "ArrowLeft"
            ? Math.max(0, index - 1)
            : Math.min(historyImages.length - 1, index + 1);
        setSelectedId(historyImages[next]?.id ?? null);
      } else if (event.key === "[") {
        router.push(`/images/${Math.max(1, exoId - 1)}`);
      } else if (event.key === "]") {
        router.push(`/images/${exoId + 1}`);
      } else if (event.key === "Escape") {
        router.push("/images");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, selectedId, selected, exoId, busy, editOpen, historyImages, framePositions]);

  if (!styleId) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">Exercise images</h1>
          <StyleSelector styles={styles} value={styleId} onChange={setStyleId} />
        </div>
        <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500">
          Select a style to load this exercise.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-[70vh] w-full rounded-xl" />;
  }
  if (error || !exercise) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <StyleSelector styles={styles} value={styleId} onChange={setStyleId} />
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error?.message ?? "Exercise not found"}
        </div>
      </div>
    );
  }

  const plannedCount = subjects.length * runPositions.length;
  const startThumb =
    exercise.by_subject.find((s) => s.subject === subjects[0])?.active_frames.find(
      (f) => f.position === 0,
    )?.image_url ??
    exercise.by_subject.find((s) => s.active_positions.includes(0))?.active_frames.find(
      (f) => f.position === 0,
    )?.image_url;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs text-zinc-500">
            <Link href="/images" className="hover:underline">
              Images
            </Link>{" "}
            / #{exercise.exo_id}
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-zinc-900">{exercise.display_name}</h1>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
              aria-label="Edit exercise"
              title="Edit exercise"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-zinc-500">
            {exercise.primary_muscle_group?.name ?? "—"} · {exercise.equipment?.name ?? "—"} ·{" "}
            {SUBJECTS.map((subject) => {
              const status = exercise.by_subject.find((s) => s.subject === subject);
              return `${SUBJECT_LABEL[subject]} ${status?.active_count ?? 0}/${framePositions.length}`;
            }).join(" · ")}
          </p>
          <label className="mt-1 inline-flex items-center gap-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={exercise.two_frames}
              disabled={busy || queue.running}
              onChange={(e) => void toggleTwoFrames(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Two frames (Start + End)
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <StyleSelector
            styles={styles}
            value={styleId}
            onChange={setStyleId}
            disabled={queue.running}
          />
          <SubjectSelector value={subjects} onChange={setSubjects} disabled={queue.running} />
          <PositionSelector
            value={positions}
            onChange={setPositions}
            available={framePositions}
            disabled={queue.running}
          />
          <Button
            type="button"
            variant="ghost"
            aria-expanded={showOverrides}
            onClick={() => setShowOverrides((v) => !v)}
          >
            {showOverrides ? "Hide prompts" : "Edit prompts"}
            {editedCount > 0 ? ` (${editedCount} edited)` : ""}
          </Button>
          {missingStart && (
            <span className="text-xs text-amber-700">
              No active Start for {missingStartSubjects.map((s) => SUBJECT_LABEL[s]).join(", ")}:
              generate Start first
            </span>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={busy || queue.running || runPositions.length === 0 || missingStart}
            onClick={() => void runGenerate()}
          >
            {queue.running
              ? "Generating…"
              : plannedCount > 1
                ? `Generate (${plannedCount})`
                : "Generate"}
          </Button>
        </div>
      </div>

      {showOverrides && (
        <PromptOverridesPanel
          positions={runPositions}
          startThumbUrl={imageThumbUrl(startThumb, 160)}
          systemPrompts={systemPrompts}
          settingsSystemPromptId={style?.system_prompt_id}
          systemTemplate={templates.system}
          positionTemplates={templates.positions}
          value={overrides}
          onChange={setOverrides}
          disabled={queue.running}
        />
      )}

      {queue.items.map((item, index) => (
        <GenerationProgress
          key={`${item.exoId}-${item.subject}`}
          item={item}
          running={queue.running}
          onCancel={index === 0 ? queue.cancel : undefined}
        />
      ))}

      <div className="grid gap-4 xl:grid-cols-2">
        {SUBJECTS.map((subject) => (
          <SubjectLane
            key={subject}
            subject={subject}
            images={exercise.images}
            framePositions={framePositions}
          />
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium text-zinc-800">All images</div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["all", "All"],
                ["man", "Man"],
                ["woman", "Woman"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setHistorySubject(id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium",
                  historySubject === id
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {inFlight.map(({ step, subject }) => (
            <div
              key={`${subject}-${step.position}`}
              className="min-w-[120px] rounded-lg border border-dashed border-zinc-300 p-2"
              aria-label={`Generating ${SUBJECT_LABEL[subject]} ${framePositionLabel(step.position)}`}
            >
              <Skeleton className="mb-2 aspect-square w-full rounded-md" />
              <div className="truncate text-[11px] font-medium text-zinc-800">
                {framePositionLabel(step.position)} · generating…
              </div>
              <div className="truncate text-[10px] text-zinc-500">{SUBJECT_LABEL[subject]}</div>
            </div>
          ))}
          {historyImages.map((img) => (
            <div key={img.id} className="relative min-w-[120px]">
              <button
                type="button"
                onClick={() => setSelectedId(img.id)}
                className={cn(
                  "w-full rounded-lg border p-2 text-left",
                  selectedId === img.id
                    ? "border-zinc-900 ring-1 ring-zinc-900"
                    : "border-zinc-200 hover:border-zinc-300",
                )}
              >
                <div
                  className="mb-2 aspect-square overflow-hidden rounded-md bg-zinc-100"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%)",
                    backgroundSize: "12px 12px",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageThumbUrl(img.image_url, 240) ?? undefined}
                    alt={imageLabel(img)}
                    loading="lazy"
                    width={120}
                    height={120}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="truncate text-[11px] font-medium text-zinc-800">
                  {imageLabel(img)}
                </div>
                <div className="truncate text-[10px] text-zinc-500">
                  {SUBJECT_LABEL[img.subject]}
                  {img.model ? ` · ${img.model}` : ""}
                </div>
              </button>
              {isDeletableImage(img) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeImage(img)}
                  aria-label={`Delete ${imageLabel(img)} image`}
                  title="Delete image"
                  className="absolute right-3 top-3 rounded-md bg-white/90 p-1 text-red-600 shadow-sm hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {historyImages.length === 0 && inFlight.length === 0 && (
            <div className="text-sm text-zinc-500">No images yet. Generate one.</div>
          )}
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
          <div className="text-sm font-medium text-zinc-800">
            Selected image · {SUBJECT_LABEL[selected.subject]}
          </div>
          <div className="flex flex-wrap gap-2">
            {FRAME_POSITIONS.filter((frame) => framePositions.includes(frame.id)).map((frame) => (
              <Button
                key={frame.id}
                type="button"
                variant={
                  selected.active && selected.position === frame.id ? "default" : "secondary"
                }
                disabled={busy}
                onClick={() => void setPosition(selected.id, frame.id, true)}
              >
                Set {frame.label} ({frame.id})
              </Button>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !selected.active}
              onClick={() => void setPosition(selected.id, null, false)}
            >
              Deactivate
            </Button>
          </div>
          <p className="text-xs text-zinc-500">
            Activating a position replaces any other active image for this subject already at that
            slot.
          </p>
        </div>
      )}

      {selected && <ImageMetadataPanel image={selected} prompts={promptsData?.prompts} />}

      <p className="text-xs text-zinc-400">
        Shortcuts: R generate selected positions · 0/1/2 set position on selected image&apos;s
        subject · X deactivate · Del delete (images without position) · ←/→ images · [/] prev/next
        · Esc back
      </p>

      <ExerciseComposeDialog
        open={editOpen}
        editExoId={exoId}
        onClose={() => setEditOpen(false)}
        onSaved={(msg) => {
          success(msg);
          void refresh();
        }}
      />
    </div>
  );
}
