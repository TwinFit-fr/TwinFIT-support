"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { mutate } from "swr";
import {
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
import { jobStep, useGenerationJobs } from "@/hooks/use-generation-jobs";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { JobFailures } from "@/components/images/run-status";
import { ReviewBadge } from "@/components/images/review-badge";
import { SequencePublishPanel } from "@/components/images/sequence-publish-panel";
import { EditInstruction } from "@/components/images/edit-instruction";
import { useGenerationConfirm } from "@/hooks/use-generation-confirm";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  usePositionSelection,
  useStyleChoice,
  useSubjectSelection,
} from "@/hooks/use-image-preferences";
import { ExerciseComposeDialog } from "@/components/catalog/exercise-compose-dialog";
import { useElapsedSeconds } from "@/components/images/generation-progress";
import { ExercisePosesPanel } from "@/components/images/exercise-poses-panel";
import { FramePlayer } from "@/components/images/frame-player";
import { NeighbourLink } from "@/components/images/board-ui";
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
import {
  fillExerciseText,
  selectedPrompts,
  unfillExerciseText,
  type ExerciseText,
} from "@/lib/images/prompt";
import {
  frameJobSpecs,
  isActiveJob,
  type GenerationJob,
  type SkippableInput,
} from "@/lib/images/job-types";
import { activeByPosition } from "@/lib/images/publication";
import {
  EMPTY_PICK,
  PICK_SLOTS,
  cleanPick,
  effectivePick,
  liveFrames,
  poseWarningText,
  poseWarnings,
  slotOf,
  slotPosition,
  suggestPick,
  togglePick,
  unpick,
  type PickSlot,
  type SequencePick,
} from "@/lib/images/sequence";
import {
  LabeledControl,
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
  ExercisePose,
  ImagePrompt,
  ImageStyle,
  ReviewStatus,
  StyleReference,
  Subject,
} from "@/lib/images/types";
import {
  FRAME_POSITIONS,
  MID_POSITION,
  REVIEW_LABEL,
  REVIEW_STATUSES,
  SUBJECTS,
  framePositionLabel,
  intendedPosition,
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
  ["0 1 2", "Pick as Start / Mid / End"],
  ["X", "Deactivate"],
  ["Del", "Delete"],
  ["← →", "Browse"],
  ["[ ]", "Prev / next"],
  ["Esc", "Back"],
];

type SubjectPicks = Record<Subject, SequencePick>;

const NO_PICKS: SubjectPicks = { man: EMPTY_PICK, woman: EMPTY_PICK };

function imageLabel(img: ExerciseImage): string {
  if (img.active) return framePositionLabel(img.position);
  const target = targetPosition(img);
  return target != null ? `${framePositionLabel(target)} · inactive` : "Inactive";
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
  picked,
  onSelect,
}: {
  image: ExerciseImage;
  alt: string;
  selected: boolean;
  /** Chosen for the next publish, not the live frame. */
  picked: boolean;
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
          : picked
            ? "border-sky-400 enabled:hover:border-sky-500"
            : "border-zinc-200 enabled:hover:border-zinc-400",
      )}
      style={CHECKER_STYLE}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-contain" />
      )}
      {(picked || image.review_status !== "approved") && (
        <span className="absolute left-1 top-1 flex items-center gap-1">
          {picked && (
            <span className="rounded bg-sky-100 px-1 text-[9px] font-semibold leading-4 text-sky-800">
              Picked
            </span>
          )}
          <ReviewBadge status={image.review_status} />
        </span>
      )}
    </button>
  );
}

/**
 * The sequence per subject: each slot shows the frame picked for the next publish, else the live
 * (active) one, and the preview plays what a publish would put in the app.
 */
function FrameMatrix({
  images,
  framePositions,
  picks,
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
  picks: Record<Subject, SequencePick>;
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
  const twoFrames = !framePositions.includes(MID_POSITION);

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
          const subjectImages = images.filter((img) => img.subject === subject);
          const live = activeByPosition(subjectImages);
          const chosen = effectivePick(picks[subject], subjectImages, twoFrames);
          const byId = new Map(subjectImages.map((img) => [img.id, img]));
          const shown = (position: number): ExerciseImage | null => {
            const slot = slotOf(position);
            const id = slot ? chosen[slot] : null;
            return id ? (byId.get(id) ?? null) : null;
          };
          const loop = frames.flatMap((frame) => {
            const img = shown(frame.id);
            return img ? [{ position: frame.id, image_url: img.image_url }] : [];
          });
          const canAlign = loop.length >= 2;

          return (
            <div key={subject} className="contents">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-zinc-900">{SUBJECT_LABEL[subject]}</div>
                <div className="text-[11px] tabular-nums text-zinc-400">
                  {loop.length}/{frames.length}
                </div>
              </div>
              {frames.map((frame) => {
                const img = shown(frame.id);
                return img ? (
                  <FrameTile
                    key={frame.id}
                    image={img}
                    alt={`${SUBJECT_LABEL[subject]} ${frame.label}`}
                    selected={img.id === selectedId}
                    picked={img.id !== live.get(frame.id)?.id}
                    onSelect={() => onSelect(img.id)}
                  />
                ) : (
                  <EmptySlot
                    key={frame.id}
                    alt={`${SUBJECT_LABEL[subject]} ${frame.label}`}
                    blockedReason={
                      frame.id !== 0 && !shown(0)
                        ? "Pick or publish a Start first: Mid and End edit it"
                        : null
                    }
                    disabled={!canGenerate}
                    generating={generating.get(`${subject}-${frame.id}`)}
                    onGenerate={() => onGenerate(subject, frame.id)}
                  />
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
                      ? "Nudge frames so the person lines up in the GIF (saved as candidates)"
                      : "Need at least two frames"
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
  pickedIds,
  busy,
  subject,
  onSubjectChange,
  onSelect,
  onDelete,
  pending,
}: {
  images: ExerciseImage[];
  selectedId: string | null;
  /** Frames chosen for the next publish. */
  pickedIds: Set<string>;
  busy: boolean;
  /** Candidates and edits being made, shown first until they land. */
  pending: GenerationJob[];
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
      {images.length === 0 && pending.length === 0 ? (
        <div className="py-6 text-center text-xs text-zinc-400">No images yet</div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {pending.map((job) => (
            <div key={job.id} className="w-20 shrink-0">
              <div
                className="relative aspect-square w-full overflow-hidden rounded-lg border border-dashed border-zinc-300"
                style={CHECKER_STYLE}
              >
                <GeneratingOverlay startedAt={jobStep(job).startedAt} />
              </div>
              <div className="mt-1 truncate text-[10px] text-zinc-500">
                {framePositionLabel(job.position)} · {job.options.editOf ? "edit" : "candidate"}
              </div>
            </div>
          ))}
          {images.map((img) => (
            <div key={img.id} className="group relative w-20 shrink-0">
              <button
                type="button"
                onClick={() => onSelect(img.id)}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden rounded-lg border transition",
                  selectedId === img.id
                    ? "border-zinc-900 ring-2 ring-zinc-900/15"
                    : pickedIds.has(img.id)
                      ? "border-sky-400 hover:border-sky-500"
                      : "border-zinc-200 hover:border-zinc-400",
                  (!img.active || img.review_status === "rejected") &&
                    "opacity-70 hover:opacity-100",
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
                {pickedIds.has(img.id) && (
                  <span className="absolute bottom-1 left-1 rounded bg-sky-100 px-1 text-[9px] font-semibold leading-4 text-sky-800">
                    Picked
                  </span>
                )}
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
              <ReviewBadge status={img.review_status} className="mt-0.5" />
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
  pickedAt,
  onPick,
  onReview,
  onDeactivate,
  onDelete,
  onEdit,
}: {
  image: ExerciseImage | null;
  framePositions: number[];
  prompts: ImagePrompt[] | undefined;
  references: StyleReference[];
  busy: boolean;
  /** The position this image is picked for in the next publish, if any. */
  pickedAt: number | null;
  onPick: (position: number) => void;
  onReview: (status: ReviewStatus) => void;
  onDeactivate: () => void;
  onDelete: () => void;
  onEdit: (instruction: string) => void;
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

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>Review</span>
          <span className="tabular-nums text-zinc-400">
            {image.reviewed_at
              ? new Date(image.reviewed_at).toLocaleString()
              : "Not reviewed yet"}
          </span>
        </div>
        <div className="inline-flex w-full rounded-lg bg-zinc-100 p-0.5">
          {REVIEW_STATUSES.map((status) => {
            const current = image.review_status === status;
            // Pending would take an active frame out of the app without deactivating it.
            const blocked = status === "pending" && image.active;
            return (
              <button
                key={status}
                type="button"
                disabled={busy || blocked}
                aria-pressed={current}
                title={
                  blocked
                    ? "An active frame cannot go back to pending"
                    : status === "rejected" && image.active
                      ? "Reject (also deactivates this frame)"
                      : REVIEW_LABEL[status]
                }
                onClick={() => !current && onReview(status)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50",
                  current
                    ? status === "approved"
                      ? "bg-emerald-600 text-white"
                      : status === "rejected"
                        ? "bg-red-600 text-white"
                        : "bg-amber-500 text-white"
                    : "text-zinc-600 hover:bg-white hover:text-zinc-900",
                )}
              >
                {REVIEW_LABEL[status]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-[11px] text-zinc-500">Use in the next publish as</div>
        <div className="flex items-center gap-2">
          <div className="inline-flex flex-1 rounded-lg bg-zinc-100 p-0.5">
            {frames.map((frame) => {
              const current = pickedAt === frame.id;
              return (
                <button
                  key={frame.id}
                  type="button"
                  disabled={busy || image.review_status === "rejected"}
                  aria-pressed={current}
                  title={
                    image.review_status === "rejected"
                      ? "Rejected frames cannot be published"
                      : current
                        ? `Picked as ${frame.label} (${frame.id}): click to unpick`
                        : `Pick as ${frame.label} (${frame.id})`
                  }
                  onClick={() => onPick(frame.id)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50",
                    current
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-white hover:text-zinc-900",
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
            title="Take this frame out of the app (X)"
          >
            Deactivate
          </Button>
        </div>
      </div>

      <EditInstruction disabled={busy} onSubmit={onEdit} />

      <ImageMetadataPanel image={image} prompts={prompts} references={references} />
    </div>
  );
}

/** The exercise text a frame prompt fills in: the frame's pose, else the description (as the server). */
function exerciseTextOf(
  exercise: ExerciseImageDetail,
  poses: ExercisePose[],
  position: number,
): ExerciseText {
  const description = exercise.description ?? "";
  const pose = poses.find((item) => item.position === position)?.pose?.trim() || description;
  return {
    id: exercise.id,
    exo_id: exercise.exo_id,
    name: exercise.display_name,
    description,
    pose,
  };
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
  const { data: posesData } = useStaffSWR<{ poses: ExercisePose[] }>(
    `/api/images/exercises/${exoId}/poses`,
  );
  const { data: promptsData } = useStaffSWR<{ system: ImagePrompt; prompts: ImagePrompt[] }>(
    styleId ? `/api/images/prompts?styleId=${styleId}` : null,
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
  // Frames chosen for the next publish, per subject; they belong to one exercise and style.
  const pickKey = `${exoId}:${styleId}`;
  const [picksFor, setPicksFor] = useState<{ key: string; value: SubjectPicks }>({
    key: pickKey,
    value: NO_PICKS,
  });
  const [publishing, setPublishing] = useState<Subject | null>(null);
  const [publishErrors, setPublishErrors] = useState<Partial<Record<Subject, string>>>({});
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
  // And so do the automatic inputs it leaves out.
  const [skipFor, setSkipFor] = useState<{ exoId: number; value: SkippableInput[] }>({
    exoId,
    value: [],
  });
  const skipInputs = skipFor.exoId === exoId ? skipFor.value : [];
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

  // The panel shows the exercise's own text already filled in. `{subject}` and `{background_color}`
  // stay for each run, and `{pose}` stays in the system prompt, which every frame shares.
  const templates = useMemo(() => {
    const prompts = promptsData?.prompts ?? [];
    const byPosition = FRAME_POSITIONS.map((f) => selectedPrompts(prompts, f.id));
    const fill = (template: string, position?: number) => {
      if (!exercise) return template;
      const text = exerciseTextOf(exercise, posesData?.poses ?? [], position ?? 0);
      return fillExerciseText(template, position == null ? { ...text, pose: "{pose}" } : text);
    };
    return {
      system: fill(byPosition[0].system?.content ?? ""),
      positions: Object.fromEntries(
        byPosition.map((chosen, i) => [
          FRAME_POSITIONS[i].id,
          fill(chosen.position?.content ?? "", FRAME_POSITIONS[i].id),
        ]),
      ) as Record<number, string>,
    };
  }, [promptsData, posesData, exercise]);
  const framePositions = exercise?.frame_positions ?? FRAME_POSITIONS.map((f) => f.id as number);
  const runPositions = runPositionsFor(positions, framePositions);
  const editedCount = countOverrides(overrides, runPositions);

  const selected: ExerciseImage | null = useMemo(
    () => exercise?.images.find((img) => img.id === selectedId) ?? null,
    [exercise, selectedId],
  );

  // The picks without images that are gone (deleted) or no longer fit (Mid of a two-frame exercise).
  const picks = useMemo<SubjectPicks>(() => {
    const stored = picksFor.key === pickKey ? picksFor.value : NO_PICKS;
    if (!exercise) return stored;
    const clean = (subject: Subject) =>
      cleanPick(
        stored[subject],
        exercise.images.filter((img) => img.subject === subject),
        exercise.two_frames,
      );
    return { man: clean("man"), woman: clean("woman") };
  }, [picksFor, pickKey, exercise]);
  const setSubjectPick = (subject: Subject, pick: SequencePick) => {
    setPicksFor({ key: pickKey, value: { ...picks, [subject]: pick } });
    setPublishErrors((current) => ({ ...current, [subject]: undefined }));
  };
  // The Start each subject would have after a publish: the picked one, else the active one.
  const startIds = useMemo<Record<Subject, string | null>>(() => {
    const startOf = (subject: Subject) =>
      exercise
        ? effectivePick(
            picks[subject],
            exercise.images.filter((img) => img.subject === subject),
            exercise.two_frames,
          ).start
        : null;
    return { man: startOf("man"), woman: startOf("woman") };
  }, [exercise, picks]);

  const pickedIds = useMemo(
    () =>
      new Set(
        Object.values(picks)
          .flatMap((pick) => Object.values(pick))
          .filter((id): id is string => id != null),
      ),
    [picks],
  );

  const historyImages = useMemo(() => {
    const images = exercise?.images ?? [];
    if (historySubject === "all") return images;
    return images.filter((img) => img.subject === historySubject);
  }, [exercise, historySubject]);

  // Candidates per position (and per subject): every run only adds candidates to History.
  const [variants, setVariants] = useState(1);

  // Mid/End need a Start per selected subject: this run's, or (when the run has no Start) the
  // one picked for the next publish, else the active one.
  const missingStartSubjects = useMemo(() => {
    if (!exercise || runPositions.includes(0) || !runPositions.some((p) => p !== 0)) return [];
    return subjects.filter((subject) => !startIds[subject]);
  }, [exercise, runPositions, subjects, startIds]);
  const missingStart = missingStartSubjects.length > 0;

  const refresh = useCallback(async () => {
    if (detailKey) await mutate(detailKey);
    if (listKey) await mutate(listKey);
  }, [detailKey, listKey]);

  // Runs are processed on the server; each finished frame refreshes this exercise.
  const jobs = useGenerationJobs(styleId, { kind: "exercise_frame", exoId }, () => void refresh());
  const running = jobs.progress.active;
  const generating = useMemo(() => {
    const map = new Map<string, { startedAt?: number }>();
    for (const job of jobs.jobs) {
      if (isActiveJob(job) && !job.options.editOf) {
        map.set(`${job.subject}-${job.position}`, jobStep(job));
      }
    }
    return map;
  }, [jobs.jobs]);
  const failedJobs = jobs.jobs.filter((job) => job.status === "error");
  const pendingCandidates = jobs.jobs.filter(isActiveJob);
  // Poses are what the frames are drawn from: warn while one of them is not approved.
  const generationPoseWarning = posesData
    ? poseWarningText(poseWarnings(posesData.poses, runPositions))
    : "";
  const publishPoseWarning = posesData
    ? poseWarningText(poseWarnings(posesData.poses, framePositions))
    : "";

  /** Generates the toolbar's subjects and positions, or one empty slot of the matrix. */
  async function runGenerate(slot?: { subject: Subject; position: number }) {
    if (!exercise || !styleId || running) return;
    if (!slot && missingStart) return;
    const runSubjects = slot ? [slot.subject] : subjects;
    const positionsToRun = slot ? [slot.position] : runPositions;
    // An empty slot is filled directly; the toolbar run makes the chosen number of candidates.
    const runVariants = slot ? 1 : variants;
    const count = runSubjects.length * positionsToRun.length * runVariants;
    if (!(await confirmGeneration.run(count))) return;
    const run = overrides;
    const referenceIds = runReferences;
    const skipped = skipInputs;
    try {
      await jobs.enqueue(
        frameJobSpecs({
          exercises: [{ exoId: exercise.exo_id, framePositions: exercise.frame_positions }],
          positions: positionsToRun,
          subjects: runSubjects,
          variants: runVariants,
          options: (position, subject) => ({
            systemOverride: run.system,
            positionOverride: run.positions[position],
            referenceIds,
            skipInputs: skipped.length ? skipped : undefined,
            // Mid / End of a run without Start edit the Start picked or live for that subject.
            guideImageId:
              position !== 0 && !positionsToRun.includes(0)
                ? (startIds[subject] ?? undefined)
                : undefined,
          }),
        }),
      );
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed", "Could not queue");
    }
  }

  /** Makes a run's prompt edit the style's prompt of that slot (the old text stays in history). */
  async function saveOverrideToStyle(slot: "system" | number, text: string) {
    const chosen = selectedPrompts(promptsData?.prompts ?? [], slot === "system" ? 0 : slot);
    const prompt = slot === "system" ? chosen.system : chosen.position;
    if (!prompt || !styleId) return;
    const name = slot === "system" ? "System" : framePositionLabel(slot);
    const ok = await confirm({
      title: `Save as the style's ${name} prompt?`,
      description:
        "Every future generation of this style uses it. The current text stays in the prompt's history on Styles → Prompts.",
      confirmLabel: "Save to style",
    });
    if (!ok) return;
    // The text shows this exercise's values; the style's template keeps their placeholders.
    const position = slot === "system" ? 0 : slot;
    const content = exercise
      ? unfillExerciseText(
          text,
          slot === "system"
            ? { ...exerciseTextOf(exercise, posesData?.poses ?? [], position), pose: "{pose}" }
            : exerciseTextOf(exercise, posesData?.poses ?? [], position),
        )
      : text;
    try {
      await staffFetch(`/api/images/prompts/${prompt.id}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      await mutate(`/api/images/prompts?styleId=${styleId}`);
      // The run text is now the template, so it is no longer an edit.
      setOverrides(
        slot === "system"
          ? { ...overrides, system: undefined }
          : { ...overrides, positions: { ...overrides.positions, [slot]: undefined } },
      );
      success(`Saved as the style's ${name} prompt`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    }
  }

  /** Queues an edit of an image; the result lands in History as a candidate of its position. */
  async function queueEdit(image: ExerciseImage, instruction: string) {
    const position = intendedPosition(image);
    if (position == null) return;
    if (!(await confirmGeneration.run(1))) return;
    try {
      await jobs.enqueue([
        {
          kind: "exercise_frame",
          exoId,
          subject: image.subject,
          position,
          options: { editOf: image.id, instruction },
        },
      ]);
      success("Edit queued: it will appear in History");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed", "Could not queue");
    }
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
    if (
      !next &&
      exercise.by_subject.some((s) => s.sequence === "published") &&
      !(await confirm({
        title: "Use Start, Mid and End?",
        description:
          "A three-frame exercise needs a Mid. It stops showing in the app until a sequence with a Mid is published.",
        confirmLabel: "Use 3 frames",
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

  /** Chooses (or unchooses) an image as the Start / Mid / End of the next publish. */
  function pickImage(image: ExerciseImage, position: number) {
    if (!framePositions.includes(position)) return;
    if (image.review_status === "rejected") {
      toastError("Rejected frames cannot be published", "Not picked");
      return;
    }
    setSubjectPick(image.subject, togglePick(picks[image.subject], position, image.id));
  }

  /** The position an image is picked for in the next publish. */
  function pickedPosition(image: ExerciseImage): number | null {
    const slot = PICK_SLOTS.find((s) => picks[image.subject][s] === image.id);
    return slot ? slotPosition(slot) : null;
  }

  /** Takes a live frame out of the app; its sequence stays hidden until one is published. */
  async function deactivateImage(image: ExerciseImage | null) {
    if (!image || !image.active || busy) return;
    const ok = await confirm({
      title: `Take this ${imageLabel(image)} frame out of the app?`,
      description:
        "The frame is deactivated, so its sequence stops showing in the app until a sequence is published again.",
      confirmLabel: "Deactivate",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await staffFetch(`/api/images/items/${image.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      success("Deactivated");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  /** Approves, rejects or resets the review of one frame. */
  async function reviewImage(image: ExerciseImage, status: ReviewStatus) {
    if (busy || image.review_status === status) return;
    if (
      status === "rejected" &&
      image.active &&
      !(await confirm({
        title: "Reject this live frame?",
        description:
          "A rejected frame cannot be active: it is deactivated and its sequence stops showing in the app until a sequence is published again.",
        confirmLabel: "Reject and deactivate",
        variant: "danger",
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await staffFetch(`/api/images/items/${image.id}`, {
        method: "PATCH",
        body: JSON.stringify({ review_status: status }),
      });
      if (status === "rejected") {
        setSubjectPick(image.subject, unpick(picks[image.subject], image.id));
      }
      success(`${REVIEW_LABEL[status]}: ${SUBJECT_LABEL[image.subject]} · ${imageLabel(image)}`);
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  /** Publishes a subject's sequence (picks over live frames) with the backend's atomic function. */
  async function publishSubject(subject: Subject) {
    if (!exercise || busy) return;
    const subjectImages = exercise.images.filter((img) => img.subject === subject);
    const chosen = effectivePick(picks[subject], subjectImages, exercise.two_frames);
    if (!chosen.start || !chosen.end) return;
    setBusy(true);
    setPublishing(subject);
    setPublishErrors((current) => ({ ...current, [subject]: undefined }));
    try {
      await staffFetch("/api/images/sequences", {
        method: "POST",
        body: JSON.stringify({
          startId: chosen.start,
          midId: chosen.mid,
          endId: chosen.end,
          expectedLive: liveFrames(subjectImages),
        }),
      });
      success(`${SUBJECT_LABEL[subject]} sequence published`);
      // Show the new frames before the picks go, so the panel does not flash the old ones.
      await refresh();
      setSubjectPick(subject, EMPTY_PICK);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publish failed";
      setPublishErrors((current) => ({ ...current, [subject]: message }));
      toastError(message, "Could not publish");
    } finally {
      setPublishing(null);
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
      // The aligned copies are candidates: pick them so the next publish uses them.
      let next = picks[subject];
      for (const image of result.images) {
        const position = intendedPosition(image);
        const slot = position != null ? slotOf(position) : null;
        if (slot) next = { ...next, [slot as PickSlot]: image.id };
      }
      setSubjectPick(subject, next);
      success(
        result.images.length === 1
          ? `Aligned ${framePositionLabel(intendedPosition(result.images[0]))}: picked, publish to use it`
          : `Aligned ${result.images.length} frames: picked, publish to use them`,
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

  function pickSelected(position: number) {
    if (selected) pickImage(selected, position);
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
      "0": () => pickSelected(0),
      "1": () => pickSelected(1),
      "2": () => pickSelected(2),
      x: () => void deactivateImage(selected),
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
          disabled={running}
        />
        <div className="flex">
          <NeighbourLink direction="previous" href={previousHref} noun="exercise" />
          <NeighbourLink direction="next" href={nextHref} noun="exercise" />
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

  const plannedCount = subjects.length * runPositions.length * variants;
  // Start is drawn from the character and library references; Mid/End edit a Start. Support and
  // equipment images go with every frame.
  const startInRun = runPositions.includes(0);
  // Mid/End edit the picked or active Start unless this run draws a new one.
  const editsExistingStart = runPositions.some((p) => p !== 0) && !startInRun;
  const support = exercise.support_equipment;
  const automaticInputs: AutomaticInput[] = [
    ...(startInRun
      ? subjects.map((subject) => ({
          label: `Character · ${SUBJECT_LABEL[subject]}`,
          detail: "For Start",
          skip: "character" as const,
          fileId: style?.characters.find((c) => c.subject === subject)?.file_id ?? null,
        }))
      : []),
    ...(editsExistingStart
      ? subjects.map((subject) => ({
          label: `Start · ${SUBJECT_LABEL[subject]}`,
          detail: "Picked or active Start, edited by Mid and End",
          fileId: exercise.images.find((img) => img.id === startIds[subject])?.file_id ?? null,
        }))
      : []),
    ...(support
      ? [
          {
            label: "Support",
            skip: "support" as const,
            detail: support.name,
            fileId:
              style?.supports.find((s) => s.support_equipment_id === support.id)?.file_id ??
              null,
          },
        ]
      : []),
    ...(exercise.equipment
      ? [
          {
            label: "Equipment",
            detail: exercise.equipment.name,
            fileId:
              style?.equipment.find((e) => e.equipment_id === exercise.equipment?.id)?.file_id ??
              null,
          },
        ]
      : []),
  ];
  const logoInputs: AutomaticInput[] =
    style?.logo_in_exercises && style.logo_file_id
      ? [{ label: "Logo", fileId: style.logo_file_id, skip: "logo" as const }]
      : [];
  const startThumb = [...subjects, ...SUBJECTS]
    .map((subject) => exercise.images.find((img) => img.id === startIds[subject]))
    .find(Boolean)?.image_url;
  // What the align editor plays and nudges: the frames of the next publish, at their slots.
  const alignFrames = (subject: Subject): ExerciseImage[] => {
    const subjectImages = exercise.images.filter((img) => img.subject === subject);
    const chosen = effectivePick(picks[subject], subjectImages, exercise.two_frames);
    return framePositions.flatMap((position) => {
      const slot = slotOf(position);
      const image = subjectImages.find((img) => img.id === (slot ? chosen[slot] : null));
      return image ? [{ ...image, position }] : [];
    });
  };

  return (
    <div className="space-y-4">
      {header}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
        <SequenceLengthControl
          value={exercise.two_frames ? 2 : 3}
          disabled={busy || running}
          onChange={(next) => void toggleTwoFrames(next === 2)}
        />
        <span className="hidden h-5 w-px bg-zinc-200 sm:block" />
        <SubjectToggles value={subjects} onChange={setSubjects} disabled={running} />
        <PositionToggles
          value={positions}
          onChange={setPositions}
          available={framePositions}
          disabled={running}
        />
        <LabeledControl label="Variants">
          <SegmentedControl
            label="Candidates per position"
            value={variants}
            onChange={setVariants}
            disabled={running}
            options={[1, 2, 3, 4].map((n) => ({
              value: n,
              label: String(n),
              title: n === 1 ? "One candidate per position" : `${n} candidate sequences`,
            }))}
          />
        </LabeledControl>
        <div className="ml-auto flex items-center gap-2">
          {missingStart && !running && (
            <span
              className="text-xs text-amber-700"
              title="Mid/End are edits of a Start: generate one, then pick it (or publish it)"
            >
              No Start to edit · {missingStartSubjects.map((s) => SUBJECT_LABEL[s]).join(", ")}
            </span>
          )}
          {running && (
            <span className="flex items-center gap-1.5 text-xs tabular-nums text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {jobs.progress.done}/{jobs.progress.total}
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
          {running ? (
            <Button type="button" variant="secondary" className="h-8 py-0" onClick={() => void jobs.cancelActive()}>
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

      {generationPoseWarning && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {generationPoseWarning}. The frames are drawn from it: check and approve it in the Poses
          panel below before generating.
        </p>
      )}

      <JobFailures
        jobs={failedJobs}
        labelOf={(job) =>
          `${job.subject ? SUBJECT_LABEL[job.subject] : ""} · ${framePositionLabel(job.position)}`
        }
        canAct={!running}
        onRetry={() => void jobs.retryFailed()}
        onDismiss={() => void jobs.dismissFinished()}
      />

      {showOverrides && (
        <PromptOverridesPanel
          positions={runPositions}
          startThumbUrl={imageThumbUrl(startThumb, 160)}
          systemTemplate={templates.system}
          positionTemplates={templates.positions}
          details={exercise.prompt_details}
          value={overrides}
          onChange={setOverrides}
          onSaveToStyle={(slot, text) => void saveOverrideToStyle(slot, text)}
          disabled={running}
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
          skipped={skipInputs}
          onSkippedChange={(value) => setSkipFor({ exoId, value })}
          note={
            startInRun
              ? "Support and equipment go with every frame; character and library references only with Start, which Mid and End then edit."
              : "Mid and End edit the picked (else active) Start and also get support and equipment; library references are only sent with Start."
          }
          referencesDisabled={!startInRun}
          disabled={running}
        />
      )}

      <ExercisePosesPanel exoId={exoId} twoFrames={exercise.two_frames} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <FrameMatrix
            images={exercise.images}
            framePositions={framePositions}
            picks={picks}
            selectedId={selectedId}
            generating={generating}
            busy={busy}
            canGenerate={!busy && !running}
            onSelect={setSelectedId}
            onAlign={setAlignSubject}
            onGenerate={(subject, position) => void runGenerate({ subject, position })}
          />
          <SequencePublishPanel
            exercise={exercise}
            picks={picks}
            styleName={style?.name ?? ""}
            styleUnpublished={style != null && !style.published}
            poseWarning={publishPoseWarning}
            busy={busy}
            publishing={publishing}
            errors={publishErrors}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onSuggest={(subject) =>
              setSubjectPick(
                subject,
                suggestPick(
                  exercise.images.filter((img) => img.subject === subject),
                  exercise.two_frames,
                ),
              )
            }
            onReset={(subject) => setSubjectPick(subject, EMPTY_PICK)}
            onPublish={(subject) => void publishSubject(subject)}
          />
          <HistoryStrip
            images={historyImages}
            selectedId={selectedId}
            pickedIds={pickedIds}
            busy={busy}
            subject={historySubject}
            onSubjectChange={setHistorySubject}
            onSelect={setSelectedId}
            onDelete={(img) => void removeImage(img)}
            pending={pendingCandidates.filter(
              (job) => historySubject === "all" || job.subject === historySubject,
            )}
          />
        </div>
        <aside className="lg:sticky lg:top-28">
          <Inspector
            image={selected}
            framePositions={framePositions}
            prompts={promptsData?.prompts}
            references={library}
            busy={busy}
            pickedAt={selected ? pickedPosition(selected) : null}
            onPick={(position) => selected && pickImage(selected, position)}
            onReview={(status) => selected && void reviewImage(selected, status)}
            onDeactivate={() => void deactivateImage(selected)}
            onDelete={() => void removeImage(selected)}
            onEdit={(instruction) => selected && void queueEdit(selected, instruction)}
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
          frames={alignFrames(alignSubject)}
          busy={busy}
          onClose={() => setAlignSubject(null)}
          onSave={(adjustments) => saveAlign(alignSubject, adjustments)}
        />
      )}
    </div>
  );
}
