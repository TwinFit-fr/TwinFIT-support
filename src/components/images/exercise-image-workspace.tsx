"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { mutate } from "swr";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageOff,
  Loader2,
  Move,
  Layers,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button, Skeleton } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useGenerationConfirm } from "@/hooks/use-generation-confirm";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  useGenerationQueue,
  usePositionSelection,
  useStyleChoice,
  useSubjectSelection,
} from "@/hooks/use-generation-queue";
import { ExerciseComposeDialog } from "@/components/catalog/exercise-compose-dialog";
import { useElapsedSeconds } from "@/components/images/generation-progress";
import { FramePlayer } from "@/components/images/frame-player";
import { CHECKER_STYLE } from "@/components/images/checker";
import { ImageMetadataPanel } from "@/components/images/image-metadata";
import { FrameAlignEditor } from "@/components/images/frame-align-editor";
import {
  NO_OVERRIDES,
  PromptOverridesPanel,
  countOverrides,
  type PromptOverrides,
} from "@/components/images/prompt-overrides";
import {
  RunInputsPanel,
  effectiveReferenceIds,
  type AutomaticInput,
  type RunReferences,
} from "@/components/images/run-inputs-panel";
import { selectedPrompts } from "@/lib/images/prompt";
import { DEFAULT_MAX_CONCURRENCY } from "@/lib/images/capabilities";
import {
  PositionToggles,
  SegmentedControl,
  SequenceLengthControl,
  StyleSelector,
  SubjectToggles,
  runPositionsFor,
} from "@/components/images/generation-controls";
import type {
  ExerciseImage,
  ExerciseImageBoardItem,
  ExerciseImageDetail,
  ImagePrompt,
  ImageStyle,
  StyleReference,
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
import { boardFiltersQuery, boardNeighbours, readBoardFilters } from "@/lib/images/board-filters";
import { imageThumbUrl } from "@/lib/images/urls";
import { cn } from "@/lib/utils";

const SUBJECT_LABEL: Record<Subject, string> = {
  man: "Man",
  woman: "Woman",
};

const SHORTCUTS: [string, string][] = [
  ["R", "Generate"],
  ["0 1 2", "Assign"],
  ["X", "Deactivate"],
  ["Del", "Delete"],
  ["← →", "Browse"],
  ["[ ]", "Prev / next"],
  ["Esc", "Back"],
];

/** Where an image sits: inactive images have no position. */
type Placement = { id: string; position: number | null; active: boolean };

function placementOf(img: ExerciseImage): Placement {
  return { id: img.id, position: img.active ? img.position : null, active: img.active };
}

function imageLabel(img: ExerciseImage): string {
  if (img.active) return framePositionLabel(img.position);
  const target = targetPosition(img);
  return target != null ? `${framePositionLabel(target)} · inactive` : "Inactive";
}

/** Previous / next exercise of the board list; inert at either end. */
function NeighbourLink({
  direction,
  href,
}: {
  direction: "previous" | "next";
  href: string | null;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const label = direction === "previous" ? "Previous exercise ([)" : "Next exercise (])";
  const className = cn(
    "border border-zinc-300 bg-white p-1.5",
    direction === "previous" ? "rounded-l-md" : "-ml-px rounded-r-md",
  );
  if (!href) {
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-label={label}
        className={cn(className, "text-zinc-300")}
      >
        <Icon className="h-4 w-4" />
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(className, "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900")}
    >
      <Icon className="h-4 w-4" />
    </Link>
  );
}

function GeneratingOverlay({ startedAt }: { startedAt?: number }) {
  const elapsed = useElapsedSeconds(startedAt);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/70 text-zinc-600 backdrop-blur-[1px]">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-[11px] font-medium tabular-nums">{startedAt ? `${elapsed}s` : "Queued"}</span>
    </div>
  );
}

/** An empty slot: click to generate just this subject and position. */
function EmptySlot({
  alt,
  blockedReason,
  disabled,
  generating,
  onGenerate,
}: {
  alt: string;
  /** Why this slot cannot be generated yet (Mid/End without a Start). */
  blockedReason: string | null;
  disabled: boolean;
  generating?: { startedAt?: number };
  onGenerate: () => void;
}) {
  const ready = !blockedReason && !disabled && !generating;
  return (
    <button
      type="button"
      disabled={!ready}
      onClick={onGenerate}
      title={blockedReason ?? `Generate ${alt}`}
      aria-label={blockedReason ? `${alt}: ${blockedReason}` : `Generate ${alt}`}
      className="group/slot relative aspect-square w-full overflow-hidden rounded-lg border border-dashed border-zinc-300 transition enabled:hover:border-zinc-500 enabled:hover:bg-white/60"
      style={CHECKER_STYLE}
    >
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-300 group-enabled/slot:text-zinc-400 group-enabled/slot:group-hover/slot:text-zinc-700">
        {ready ? (
          <>
            <Sparkles className="h-5 w-5" strokeWidth={1.5} />
            <span className="text-[10px] font-medium">Generate</span>
          </>
        ) : (
          <ImageOff className="h-5 w-5" strokeWidth={1.5} />
        )}
      </span>
      {generating && <GeneratingOverlay startedAt={generating.startedAt} />}
    </button>
  );
}

function FrameTile({
  image,
  alt,
  selected,
  generating,
  onSelect,
}: {
  image: ExerciseImage;
  alt: string;
  selected: boolean;
  /** Present while this slot is in the queue; startedAt once its request is sent. */
  generating?: { startedAt?: number };
  onSelect: () => void;
}) {
  const src = imageThumbUrl(image.image_url, 400);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-lg border transition",
        selected
          ? "border-zinc-900 ring-2 ring-zinc-900/15"
          : "border-zinc-200 enabled:hover:border-zinc-400",
      )}
      style={CHECKER_STYLE}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-contain" />
      )}
      {generating && <GeneratingOverlay startedAt={generating.startedAt} />}
    </button>
  );
}

function FrameMatrix({
  images,
  framePositions,
  selectedId,
  generating,
  busy,
  canGenerate,
  onSelect,
  onAlign,
  onGenerate,
}: {
  images: ExerciseImage[];
  framePositions: number[];
  selectedId: string | null;
  generating: Map<string, { startedAt?: number }>;
  busy: boolean;
  /** Empty slots can start a generation (nothing else is running). */
  canGenerate: boolean;
  onSelect: (id: string) => void;
  onAlign: (subject: Subject) => void;
  onGenerate: (subject: Subject, position: number) => void;
}) {
  const frames = FRAME_POSITIONS.filter((frame) => framePositions.includes(frame.id));
  const columns = { gridTemplateColumns: `3.5rem repeat(${frames.length + 1}, minmax(0, 1fr))` };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-2.5 sm:p-3">
      <div className="grid items-center gap-1.5 sm:gap-2.5" style={columns}>
        <span />
        {frames.map((frame) => (
          <span
            key={frame.id}
            className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]"
          >
            {frame.label}
          </span>
        ))}
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-900 sm:text-[11px]">
          Preview
        </span>

        {SUBJECTS.map((subject) => {
          const active = new Map<number, ExerciseImage>();
          for (const img of images) {
            if (img.subject === subject && img.active && img.position != null) {
              active.set(img.position, img);
            }
          }
          const activeList = frames
            .map((frame) => active.get(frame.id))
            .filter((img): img is ExerciseImage => Boolean(img));
          const loop = activeList.map((img) => ({
            position: img.position as number,
            image_url: img.image_url,
          }));
          const canAlign = activeList.length >= 2;

          return (
            <div key={subject} className="contents">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-zinc-900">{SUBJECT_LABEL[subject]}</div>
                <div className="text-[11px] tabular-nums text-zinc-400">
                  {loop.length}/{frames.length}
                </div>
              </div>
              {frames.map((frame) => {
                const img = active.get(frame.id) ?? null;
                return (
                  img ? (
                    <FrameTile
                      key={frame.id}
                      image={img}
                      alt={`${SUBJECT_LABEL[subject]} ${frame.label}`}
                      selected={img.id === selectedId}
                      generating={generating.get(`${subject}-${frame.id}`)}
                      onSelect={() => onSelect(img.id)}
                    />
                  ) : (
                    <EmptySlot
                      key={frame.id}
                      alt={`${SUBJECT_LABEL[subject]} ${frame.label}`}
                      blockedReason={
                        frame.id !== 0 && !active.has(0)
                          ? "Generate Start first: Mid and End edit it"
                          : null
                      }
                      disabled={!canGenerate}
                      generating={generating.get(`${subject}-${frame.id}`)}
                      onGenerate={() => onGenerate(subject, frame.id)}
                    />
                  )
                );
              })}
              <div
                className="relative aspect-square w-full overflow-hidden rounded-lg border border-zinc-300 ring-1 ring-zinc-900/5"
                style={CHECKER_STYLE}
              >
                <FramePlayer
                  frames={loop}
                  fallbackUrl={null}
                  alt={`Preview · ${SUBJECT_LABEL[subject]}`}
                  width={400}
                />
                <button
                  type="button"
                  disabled={busy || !canAlign}
                  onClick={() => onAlign(subject)}
                  title={
                    canAlign
                      ? "Nudge frames so the person lines up in the GIF"
                      : "Need at least two active frames"
                  }
                  aria-label={`Align ${SUBJECT_LABEL[subject]} frames`}
                  className="absolute left-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 shadow-xs transition hover:bg-white hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-40"
                >
                  <Move className="h-3 w-3" />
                  Align
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryStrip({
  images,
  selectedId,
  busy,
  subject,
  onSubjectChange,
  onSelect,
  onDelete,
}: {
  images: ExerciseImage[];
  selectedId: string | null;
  busy: boolean;
  subject: "all" | Subject;
  onSubjectChange: (next: "all" | Subject) => void;
  onSelect: (id: string) => void;
  onDelete: (img: ExerciseImage) => void;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-zinc-900">History</span>
          <span className="text-xs tabular-nums text-zinc-400">{images.length}</span>
        </div>
        <SegmentedControl
          label="History subject"
          size="xs"
          value={subject}
          onChange={onSubjectChange}
          options={[
            { value: "all", label: "All" },
            { value: "man", label: "Man" },
            { value: "woman", label: "Woman" },
          ]}
        />
      </div>
      {images.length === 0 ? (
        <div className="py-6 text-center text-xs text-zinc-400">No images yet</div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img) => (
            <div key={img.id} className="group relative w-20 shrink-0">
              <button
                type="button"
                onClick={() => onSelect(img.id)}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden rounded-lg border transition",
                  selectedId === img.id
                    ? "border-zinc-900 ring-2 ring-zinc-900/15"
                    : "border-zinc-200 hover:border-zinc-400",
                  !img.active && "opacity-70 hover:opacity-100",
                )}
                style={CHECKER_STYLE}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageThumbUrl(img.image_url, 160) ?? undefined}
                  alt={`${SUBJECT_LABEL[img.subject]} · ${imageLabel(img)}`}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-contain"
                />
                <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[9px] font-semibold text-zinc-600">
                  {SUBJECT_LABEL[img.subject][0]}
                </span>
              </button>
              <div className="mt-1 flex items-center gap-1 text-[10px]">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    img.active ? "bg-emerald-500" : "bg-zinc-300",
                  )}
                />
                <span
                  className={cn("truncate", img.active ? "text-zinc-800" : "text-zinc-400")}
                >
                  {imageLabel(img)}
                </span>
              </div>
              {isDeletableImage(img) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDelete(img)}
                  aria-label={`Delete ${imageLabel(img)} image`}
                  title="Delete"
                  className="absolute right-1 top-1 rounded bg-white/90 p-0.5 text-zinc-500 opacity-0 shadow-xs transition hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Inspector({
  image,
  framePositions,
  prompts,
  references,
  busy,
  onAssign,
  onDeactivate,
  onDelete,
}: {
  image: ExerciseImage | null;
  framePositions: number[];
  prompts: ImagePrompt[] | undefined;
  references: StyleReference[];
  busy: boolean;
  onAssign: (position: number) => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  if (!image) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-400">
        No image selected
      </div>
    );
  }
  const frames = FRAME_POSITIONS.filter((frame) => framePositions.includes(frame.id));

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-lg border border-zinc-200"
        style={CHECKER_STYLE}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageThumbUrl(image.image_url, 640) ?? undefined}
          alt={`${SUBJECT_LABEL[image.subject]} · ${imageLabel(image)}`}
          className="absolute inset-0 h-full w-full object-contain"
        />
        <a
          href={image.image_url}
          target="_blank"
          rel="noreferrer"
          title="Open original"
          aria-label="Open original"
          className="absolute right-2 top-2 rounded-md bg-white/90 p-1 text-zinc-500 shadow-xs hover:text-zinc-900"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              image.active ? "bg-emerald-500" : "bg-zinc-300",
            )}
          />
          {SUBJECT_LABEL[image.subject]} · {imageLabel(image)}
        </div>
        {isDeletableImage(image) && (
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            title="Delete"
            aria-label="Delete image"
            className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="inline-flex flex-1 rounded-lg bg-zinc-100 p-0.5">
          {frames.map((frame) => {
            const current = image.active && image.position === frame.id;
            return (
              <button
                key={frame.id}
                type="button"
                disabled={busy}
                aria-pressed={current}
                title={`Use as ${frame.label} (${frame.id})`}
                onClick={() => !current && onAssign(frame.id)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50",
                  current ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-white hover:text-zinc-900",
                )}
              >
                {frame.label}
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-7 px-2 py-0 text-xs"
          disabled={busy || !image.active}
          onClick={onDeactivate}
          title="Deactivate (X)"
        >
          Deactivate
        </Button>
      </div>

      <ImageMetadataPanel image={image} prompts={prompts} references={references} />
    </div>
  );
}

export function ExerciseImageWorkspace({ exoId }: { exoId: number }) {
  const router = useRouter();
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const confirm = useConfirm();
  const confirmGeneration = useGenerationConfirm();
  const [positions, setPositions] = usePositionSelection();
  const [subjects, setSubjects] = useSubjectSelection();
  const { data: stylesData } = useStaffSWR<{ styles: ImageStyle[] }>("/api/images/styles");
  const styles = stylesData?.styles ?? [];
  const [styleId, setStyleId] = useStyleChoice(styles);
  const detailKey = styleId ? `/api/images/exercises/${exoId}?style=${styleId}` : null;
  const listKey = styleId ? `/api/images/exercises?style=${styleId}` : null;
  // Previous / next browse the board list with the filters the board was left with.
  const boardFilters = readBoardFilters(useSearchParams());
  const filtersQuery = boardFiltersQuery(boardFilters);
  const { data: boardData } = useStaffSWR<{ exercises: ExerciseImageBoardItem[] }>(listKey);
  const neighbours = boardNeighbours(boardData?.exercises ?? [], boardFilters, exoId);
  const exerciseHref = (id: number | null) => (id == null ? null : `/images/${id}${filtersQuery}`);
  const previousHref = exerciseHref(neighbours.previous);
  const nextHref = exerciseHref(neighbours.next);
  const boardHref = `/images${filtersQuery}`;
  const { data: promptsData } = useStaffSWR<{ system: ImagePrompt; prompts: ImagePrompt[] }>(
    styleId ? `/api/images/prompts?styleId=${styleId}` : null,
  );
  const queue = useGenerationQueue();
  const generating = useMemo(() => {
    const map = new Map<string, { startedAt?: number }>();
    for (const item of queue.items) {
      for (const step of item.steps) {
        if (step.status === "processing" || (queue.running && step.status === "waiting")) {
          map.set(`${item.subject}-${step.position}`, { startedAt: step.startedAt });
        }
      }
    }
    return map;
  }, [queue.items, queue.running]);
  const failedSteps = queue.items.flatMap((item) =>
    item.steps
      .filter((s) => s.status === "error")
      .map((s) => ({ subject: item.subject, position: s.position, error: s.error })),
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
  const [alignSubject, setAlignSubject] = useState<Subject | null>(null);
  const [showOverrides, setShowOverrides] = useState(false);
  // Per-run edits belong to one exercise; they reset when navigating to another.
  const [overridesFor, setOverridesFor] = useState<{ exoId: number; value: PromptOverrides }>({
    exoId,
    value: NO_OVERRIDES,
  });
  const overrides = overridesFor.exoId === exoId ? overridesFor.value : NO_OVERRIDES;
  const setOverrides = (value: PromptOverrides) => setOverridesFor({ exoId, value });
  const [showInputs, setShowInputs] = useState(false);
  // Like prompt edits, a run's reference choice belongs to one exercise.
  const [referencesFor, setReferencesFor] = useState<{ exoId: number; value: RunReferences }>({
    exoId,
    value: undefined,
  });
  const runReferences = referencesFor.exoId === exoId ? referencesFor.value : undefined;
  const style = styles.find((s) => s.id === styleId) ?? null;
  const { data: referencesData } = useStaffSWR<{ references: StyleReference[] }>(
    styleId ? `/api/images/styles/${styleId}/references` : null,
  );
  const library = useMemo(() => referencesData?.references ?? [], [referencesData]);
  const linkedReferences = useMemo(
    () => library.filter((r) => r.links.some((l) => l.kind === "exercise" && l.id === exoId)),
    [library, exoId],
  );
  const referenceCount = effectiveReferenceIds(runReferences, linkedReferences).length;

  const templates = useMemo(() => {
    const prompts = promptsData?.prompts ?? [];
    const byPosition = FRAME_POSITIONS.map((f) => selectedPrompts(prompts, f.id));
    return {
      system: byPosition[0].system?.content ?? "",
      positions: Object.fromEntries(
        byPosition.map((chosen, i) => [FRAME_POSITIONS[i].id, chosen.position?.content ?? ""]),
      ) as Record<number, string>,
    };
  }, [promptsData]);
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

  /** Generates the toolbar's subjects and positions, or one empty slot of the matrix. */
  async function runGenerate(slot?: { subject: Subject; position: number }) {
    if (!exercise || !styleId || queue.running) return;
    if (!slot && missingStart) return;
    const runSubjects = slot ? [slot.subject] : subjects;
    const positionsToRun = slot ? [slot.position] : runPositions;
    if (!(await confirmGeneration.run(runSubjects.length * positionsToRun.length))) return;
    const run = overrides;
    const referenceIds = runReferences;
    await queue.start({
      exercises: [
        {
          exoId: exercise.exo_id,
          name: exercise.display_name,
          framePositions: exercise.frame_positions,
        },
      ],
      positions: positionsToRun,
      subjects: runSubjects,
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
      generateStep: async (stepExoId, position, stepSubject, guideImageId) => {
        const { image } = (await staffFetch("/api/images/generate", {
          method: "POST",
          body: JSON.stringify({
            exoId: stepExoId,
            styleId,
            position,
            subject: stepSubject,
            systemOverride: run.system,
            positionOverride: run.positions[position],
            guideImageId,
            referenceIds,
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
      !(await confirm({
        title: "Use only Start and End?",
        description: "Active Mid frames will be deactivated.",
        confirmLabel: "Use 2 frames",
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await staffFetch(`/api/images/exercises/${exercise.exo_id}?style=${styleId}`, {
        method: "PATCH",
        body: JSON.stringify({ two_frames: next }),
      });
      success(next ? "2 frames" : "3 frames");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  /** Applies placements in order; the server deactivates whoever held a position taken. */
  async function place(placements: Placement[]) {
    for (const { id, position, active } of placements) {
      await staffFetch(`/api/images/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ position, active }),
      });
    }
  }

  async function setPosition(imageId: string, position: number | null, active: boolean) {
    const image = exercise?.images.find((img) => img.id === imageId);
    if (!image) return;
    // The way back: first the image this one displaces, then this image where it was.
    const displaced = exercise?.images.find(
      (img) =>
        img.id !== imageId &&
        img.subject === image.subject &&
        img.active &&
        active &&
        img.position === position,
    );
    const undo = [...(displaced ? [placementOf(displaced)] : []), placementOf(image)];
    setBusy(true);
    try {
      await place([{ id: imageId, position, active }]);
      success(active ? `Set as ${framePositionLabel(position)}` : "Deactivated", undefined, {
        label: "Undo",
        onClick: () => void restore(undo),
      });
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function restore(undo: Placement[]) {
    setBusy(true);
    try {
      await place(undo);
      success("Change undone");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(image: ExerciseImage | null) {
    if (!image || !isDeletableImage(image) || busy) return;
    const remove = await confirm({
      title: `Delete this ${imageLabel(image)} image?`,
      description: "It is deleted permanently.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!remove) return;
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

  async function saveAlign(
    subject: Subject,
    adjustments: { imageId: string; dx: number; dy: number; scale: number }[],
  ) {
    if (!styleId) return;
    setBusy(true);
    try {
      const result = (await staffFetch("/api/images/align", {
        method: "POST",
        body: JSON.stringify({ exoId, styleId, subject, adjustments }),
      })) as { images: ExerciseImage[] };
      success(
        result.images.length === 1
          ? `Aligned ${framePositionLabel(result.images[0].position)}`
          : `Aligned ${result.images.length} frames`,
      );
      setAlignSubject(null);
      if (result.images[0]) setSelectedId(result.images[0].id);
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Align failed");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  function assignSelected(position: number) {
    // Activates the position on the selected image (its subject lane).
    if (!selected || !framePositions.includes(position)) return;
    void setPosition(selected.id, position, true);
  }

  function browseHistory(step: -1 | 1) {
    if (!historyImages.length) return;
    const index = historyImages.findIndex((img) => img.id === selectedId);
    const next = Math.min(historyImages.length - 1, Math.max(0, index + step));
    setSelectedId(historyImages[next]?.id ?? null);
  }

  function deleteSelected() {
    if (selected && isDeletableImage(selected)) void removeImage(selected);
  }

  useShortcuts(
    {
      r: () => void runGenerate(),
      Delete: deleteSelected,
      Backspace: deleteSelected,
      "0": () => assignSelected(0),
      "1": () => assignSelected(1),
      "2": () => assignSelected(2),
      x: () => selected && void setPosition(selected.id, null, false),
      ArrowLeft: () => browseHistory(-1),
      ArrowRight: () => browseHistory(1),
      "[": () => previousHref && router.push(previousHref),
      "]": () => nextHref && router.push(nextHref),
      Escape: () => router.push(boardHref),
    },
    !editOpen && !alignSubject,
  );

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <nav className="mb-1 flex items-center gap-1 text-xs text-zinc-500">
          <Link href={boardHref} className="hover:text-zinc-900">
            Images
          </Link>
          <ChevronRight className="h-3 w-3 text-zinc-400" />
          <span className="tabular-nums">#{exoId}</span>
        </nav>
        {exercise && (
          <>
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900">
                {exercise.display_name}
              </h1>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800"
                aria-label="Edit exercise"
                title="Edit exercise"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-sm text-zinc-500">
              {[exercise.primary_muscle_group?.name, exercise.equipment?.name]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <StyleSelector
          styles={styles}
          value={styleId}
          onChange={setStyleId}
          disabled={queue.running}
        />
        <div className="flex">
          <NeighbourLink direction="previous" href={previousHref} />
          <NeighbourLink direction="next" href={nextHref} />
        </div>
      </div>
    </div>
  );

  if (!styleId) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
          Select a style to load this exercise.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {header}
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-[28rem] rounded-xl" />
          <Skeleton className="h-[28rem] rounded-xl" />
        </div>
      </div>
    );
  }
  if (error || !exercise) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error?.message ?? "Exercise not found"}
        </div>
      </div>
    );
  }

  const plannedCount = subjects.length * runPositions.length;
  // Start is the only frame built from references; Mid/End edit it.
  const startInRun = runPositions.includes(0);
  const support = exercise.support_equipment;
  const automaticInputs: AutomaticInput[] = startInRun
    ? [
        ...subjects.map((subject) => ({
          label: `Character · ${SUBJECT_LABEL[subject]}`,
          fileId: style?.characters.find((c) => c.subject === subject)?.file_id ?? null,
        })),
        ...(support
          ? [
              {
                label: "Support",
                detail: support.name,
                fileId:
                  style?.supports.find((s) => s.support_equipment_id === support.id)?.file_id ??
                  null,
              },
            ]
          : []),
      ]
    : [];
  const logoInputs: AutomaticInput[] =
    style?.logo_in_exercises && style.logo_file_id
      ? [{ label: "Logo", fileId: style.logo_file_id }]
      : [];
  const startThumb =
    exercise.by_subject.find((s) => s.subject === subjects[0])?.active_frames.find(
      (f) => f.position === 0,
    )?.image_url ??
    exercise.by_subject.find((s) => s.active_positions.includes(0))?.active_frames.find(
      (f) => f.position === 0,
    )?.image_url;

  return (
    <div className="space-y-4">
      {header}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
        <SequenceLengthControl
          value={exercise.two_frames ? 2 : 3}
          disabled={busy || queue.running}
          onChange={(next) => void toggleTwoFrames(next === 2)}
        />
        <span className="hidden h-5 w-px bg-zinc-200 sm:block" />
        <SubjectToggles value={subjects} onChange={setSubjects} disabled={queue.running} />
        <PositionToggles
          value={positions}
          onChange={setPositions}
          available={framePositions}
          disabled={queue.running}
        />
        <div className="ml-auto flex items-center gap-2">
          {missingStart && !queue.running && (
            <span
              className="text-xs text-amber-700"
              title="Mid/End are edits of the Start: generate Start first"
            >
              No active Start · {missingStartSubjects.map((s) => SUBJECT_LABEL[s]).join(", ")}
            </span>
          )}
          {queue.running && (
            <span className="flex items-center gap-1.5 text-xs tabular-nums text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {queue.imagesDone}/{queue.imagesTotal}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            className={cn("h-8 py-0 text-xs", showOverrides && "bg-zinc-100 text-zinc-900")}
            aria-expanded={showOverrides}
            onClick={() => setShowOverrides((v) => !v)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Prompts
            {editedCount > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                {editedCount}
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn("h-8 py-0 text-xs", showInputs && "bg-zinc-100 text-zinc-900")}
            aria-expanded={showInputs}
            onClick={() => setShowInputs((v) => !v)}
          >
            <Layers className="h-3.5 w-3.5" />
            Inputs
            {referenceCount > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold",
                  runReferences === undefined
                    ? "bg-zinc-200 text-zinc-700"
                    : "bg-amber-100 text-amber-800",
                )}
                title="Library references sent with Start"
              >
                {referenceCount}
              </span>
            )}
          </Button>
          {queue.running ? (
            <Button type="button" variant="secondary" className="h-8 py-0" onClick={queue.cancel}>
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              className="h-8 py-0"
              disabled={busy || runPositions.length === 0 || missingStart}
              onClick={() => void runGenerate()}
              title="Generate (R)"
            >
              {plannedCount > 1 ? `Generate ${plannedCount}` : "Generate"}
            </Button>
          )}
        </div>
      </div>

      {failedSteps.length > 0 && (
        <div className="space-y-0.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {failedSteps.map((step) => (
            <p key={`${step.subject}-${step.position}`}>
              <span className="font-medium">
                {SUBJECT_LABEL[step.subject]} · {framePositionLabel(step.position)}:
              </span>{" "}
              {step.error}
            </p>
          ))}
        </div>
      )}

      {showOverrides && (
        <PromptOverridesPanel
          positions={runPositions}
          startThumbUrl={imageThumbUrl(startThumb, 160)}
          systemTemplate={templates.system}
          positionTemplates={templates.positions}
          value={overrides}
          onChange={setOverrides}
          disabled={queue.running}
        />
      )}

      {showInputs && (
        <RunInputsPanel
          automatic={automaticInputs}
          automaticLast={logoInputs}
          linked={linkedReferences}
          library={library}
          value={runReferences}
          onChange={(value) => setReferencesFor({ exoId, value })}
          note={
            startInRun
              ? "Sent with Start. Mid and End edit that Start, so they only add the logo."
              : "This run has no Start: Mid and End edit the active Start, so library references are not sent."
          }
          disabled={queue.running || !startInRun}
        />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <FrameMatrix
            images={exercise.images}
            framePositions={framePositions}
            selectedId={selectedId}
            generating={generating}
            busy={busy}
            canGenerate={!busy && !queue.running}
            onSelect={setSelectedId}
            onAlign={setAlignSubject}
            onGenerate={(subject, position) => void runGenerate({ subject, position })}
          />
          <HistoryStrip
            images={historyImages}
            selectedId={selectedId}
            busy={busy}
            subject={historySubject}
            onSubjectChange={setHistorySubject}
            onSelect={setSelectedId}
            onDelete={(img) => void removeImage(img)}
          />
        </div>
        <aside className="lg:sticky lg:top-28">
          <Inspector
            image={selected}
            framePositions={framePositions}
            prompts={promptsData?.prompts}
            references={library}
            busy={busy}
            onAssign={(position) => selected && void setPosition(selected.id, position, true)}
            onDeactivate={() => selected && void setPosition(selected.id, null, false)}
            onDelete={() => void removeImage(selected)}
          />
        </aside>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400">
        {SHORTCUTS.map(([keys, label]) => (
          <span key={label} className="inline-flex items-center gap-1">
            <kbd className="rounded border border-zinc-200 bg-white px-1 font-sans text-[10px] text-zinc-500">
              {keys}
            </kbd>
            {label}
          </span>
        ))}
      </div>

      <ExerciseComposeDialog
        open={editOpen}
        editExoId={exoId}
        onClose={() => setEditOpen(false)}
        onSaved={(msg) => {
          success(msg);
          void refresh();
        }}
      />

      {alignSubject && (
        <FrameAlignEditor
          open
          subject={alignSubject}
          frames={exercise.images.filter(
            (img) =>
              img.subject === alignSubject &&
              img.active &&
              img.position != null &&
              framePositions.includes(img.position),
          )}
          busy={busy}
          onClose={() => setAlignSubject(null)}
          onSave={(adjustments) => saveAlign(alignSubject, adjustments)}
        />
      )}
    </div>
  );
}
