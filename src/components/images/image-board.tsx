"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { mutate } from "swr";
import { Search } from "lucide-react";
import { Input, Skeleton } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import {
  BOARD_GRID,
  BOARD_REFRESH_MS,
  EmptyState,
  StatusTabs,
  statusCounts,
} from "@/components/images/board-ui";
import { ExerciseImageCard } from "@/components/images/exercise-image-card";
import { GenerationQueueBar } from "@/components/images/generation-queue-bar";
import { StyleSelector, runPositionsFor } from "@/components/images/generation-controls";
import { useBoardSelection } from "@/hooks/use-board-selection";
import { frameQueueItems, useGenerationJobs } from "@/hooks/use-generation-jobs";
import { useGenerationConfirm } from "@/hooks/use-generation-confirm";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  useFrameCountChoice,
  usePositionSelection,
  useStyleChoice,
  useSubjectSelection,
} from "@/hooks/use-image-preferences";
import {
  type BoardFilters,
  boardFiltersQuery,
  matchesBoardFilters,
  readBoardFilters,
} from "@/lib/images/board-filters";
import { frameJobSpecs } from "@/lib/images/job-types";
import { MID_POSITION, framePositionsFor } from "@/lib/images/types";
import type {
  ExerciseImageBoardItem,
  ImageStyle,
  Subject,
} from "@/lib/images/types";
import { cn } from "@/lib/utils";

type ListResponse = { exercises: ExerciseImageBoardItem[]; count: number };

function FilterSelect({
  value,
  onChange,
  allLabel,
  children: options,
}: {
  value: string;
  onChange: (next: string) => void;
  allLabel: string;
  children: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 rounded-md border bg-white px-2 text-xs text-zinc-900 hover:border-zinc-400 focus:border-zinc-900 focus:outline-none",
        value === "all" ? "border-zinc-300" : "border-zinc-900",
      )}
    >
      <option value="all">{allLabel}</option>
      {options.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}

function subjectHasStart(exercise: ExerciseImageBoardItem, subject: Subject): boolean {
  return (
    exercise.by_subject.find((s) => s.subject === subject)?.active_positions.includes(0) ?? false
  );
}

export function ImageBoard() {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const confirm = useConfirm();
  const confirmGeneration = useGenerationConfirm();
  const { data: stylesData } = useStaffSWR<{ styles: ImageStyle[] }>("/api/images/styles");
  const styles = stylesData?.styles ?? [];
  const [styleId, setStyleId] = useStyleChoice(styles);
  const listKey = styleId ? `/api/images/exercises?style=${styleId}` : null;
  const { data, isLoading, error } = useStaffSWR<ListResponse>(listKey, {
    refreshInterval: BOARD_REFRESH_MS,
  });
  const [positions, setPositions] = usePositionSelection();
  const [subjects, setSubjects] = useSubjectSelection();
  const [frameCount, setFrameCount] = useFrameCountChoice();
  const [preparing, setPreparing] = useState(false);
  const searchParams = useSearchParams();
  const filters = useMemo(() => readBoardFilters(searchParams), [searchParams]);
  const filtersQuery = boardFiltersQuery(filters);
  // Replaced in place: typing a search adds no history entries.
  const setFilters = (patch: Partial<BoardFilters>) =>
    window.history.replaceState(null, "", `/images${boardFiltersQuery({ ...filters, ...patch })}`);
  // Runs are processed on the server; finished frames refresh the board.
  const jobs = useGenerationJobs(styleId, { kind: "exercise_frame" }, () => {
    if (listKey) void mutate(listKey);
  });

  const exercises = useMemo(() => data?.exercises ?? [], [data]);

  const muscleOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const ex of exercises) {
      if (ex.primary_muscle_group)
        map.set(ex.primary_muscle_group.id, ex.primary_muscle_group.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [exercises]);

  const equipmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const ex of exercises) {
      if (ex.equipment) map.set(ex.equipment.id, ex.equipment.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [exercises]);

  const filtered = useMemo(
    () => exercises.filter((ex) => matchesBoardFilters(ex, filters)),
    [exercises, filters],
  );

  const visibleIds = useMemo(() => filtered.map((ex) => ex.exo_id), [filtered]);
  const selection = useBoardSelection(visibleIds);

  const counts = useMemo(() => statusCounts(exercises.map((ex) => ex.status)), [exercises]);

  // With a batch frame count, positions it lacks (Mid for 2 frames) are not offered.
  const batchPositions = frameCount === "exercise" ? undefined : framePositionsFor(frameCount === 2);
  const runPositions = batchPositions ? runPositionsFor(positions, batchPositions) : positions;
  const selectedExercises = filtered.filter((ex) => selection.has(ex.exo_id));
  // Mid/End are edits of a Start: without Start in the run, every selected subject needs one.
  const runnableExercises = runPositions.includes(0)
    ? selectedExercises
    : selectedExercises.filter((ex) => subjects.every((s) => subjectHasStart(ex, s)));
  const withoutStart = selectedExercises.length - runnableExercises.length;
  const framePositionsOf = (ex: ExerciseImageBoardItem) => batchPositions ?? ex.frame_positions;
  const plannedImages = runnableExercises.reduce(
    (sum, ex) =>
      sum +
      subjects.length * framePositionsOf(ex).filter((p) => runPositions.includes(p)).length,
    0,
  );

  /** Saves the batch frame count on the exercises that differ; false if the user backs out. */
  async function applyFrameCount(exercises: ExerciseImageBoardItem[]): Promise<boolean> {
    if (frameCount === "exercise" || !styleId) return true;
    const twoFrames = frameCount === 2;
    const changing = exercises.filter((ex) => ex.two_frames !== twoFrames);
    if (!changing.length) return true;
    const losingMid = changing.filter((ex) =>
      ex.by_subject.some((s) => s.active_positions.includes(MID_POSITION)),
    );
    if (
      losingMid.length &&
      !(await confirm({
        title: "Switch to 2 frames?",
        description: `${losingMid.length} exercise(s) have an active Mid frame. Switching them to 2 frames deactivates it.`,
        confirmLabel: "Use 2 frames",
      }))
    ) {
      return false;
    }
    setPreparing(true);
    try {
      for (let i = 0; i < changing.length; i += 5) {
        await Promise.all(
          changing.slice(i, i + 5).map((ex) =>
            staffFetch(`/api/images/exercises/${ex.exo_id}?style=${styleId}`, {
              method: "PATCH",
              body: JSON.stringify({ two_frames: twoFrames }),
            }),
          ),
        );
      }
      return true;
    } finally {
      setPreparing(false);
      if (listKey) await mutate(listKey);
    }
  }

  async function startQueue() {
    if (!runnableExercises.length || preparing || !styleId) return;
    if (!(await confirmGeneration.run(plannedImages))) return;
    try {
      if (!(await applyFrameCount(runnableExercises))) return;
      await jobs.enqueue(
        frameJobSpecs({
          exercises: runnableExercises.map((ex) => ({
            exoId: ex.exo_id,
            framePositions: framePositionsOf(ex),
          })),
          positions: runPositions,
          subjects,
        }),
      );
      success(`${plannedImages} image(s) queued`, "Generating on the server");
      selection.clear();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed", "Could not queue");
    }
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Exercises</h1>
        <StyleSelector
          styles={styles}
          value={styleId}
          onChange={setStyleId}
          disabled={preparing}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusTabs
          value={filters.status}
          onChange={(status) => setFilters({ status })}
          counts={counts}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input
              value={filters.q}
              onChange={(e) => setFilters({ q: e.target.value })}
              placeholder="Search name or #id"
              className="h-8 w-56 py-1 pl-8 text-xs"
            />
          </div>
          <FilterSelect
            value={filters.muscle}
            onChange={(muscle) => setFilters({ muscle })}
            allLabel="All muscles"
          >
            {muscleOptions}
          </FilterSelect>
          <FilterSelect
            value={filters.equipment}
            onChange={(equipment) => setFilters({ equipment })}
            allLabel="All equipment"
          >
            {equipmentOptions}
          </FilterSelect>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </div>
      )}

      {styleId && !isLoading && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="tabular-nums">
            {filtered.length} exercise{filtered.length === 1 ? "" : "s"}
          </span>
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={selection.allSelected ? selection.clear : selection.selectAll}
              className="font-medium text-zinc-600 hover:text-zinc-900"
            >
              {selection.allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
      )}

      {!styleId ? (
        <EmptyState>Select a style to load the board.</EmptyState>
      ) : isLoading ? (
        <div className={BOARD_GRID}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/1.3] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState>No exercises match these filters.</EmptyState>
      ) : (
        <div className={BOARD_GRID}>
          {filtered.map((ex) => (
            <ExerciseImageCard
              key={ex.id}
              exercise={ex}
              href={`/images/${ex.exo_id}${filtersQuery}`}
              selected={selection.has(ex.exo_id)}
              selecting={selection.count > 0}
              onToggle={(range) => selection.toggle(ex.exo_id, range)}
            />
          ))}
        </div>
      )}

      <GenerationQueueBar
        selectedCount={selection.count}
        onClearSelection={selection.clear}
        plannedImages={plannedImages}
        withoutStart={withoutStart}
        frameCount={frameCount}
        onFrameCountChange={setFrameCount}
        positions={positions}
        availablePositions={batchPositions}
        onPositionsChange={setPositions}
        subjects={subjects}
        onSubjectsChange={setSubjects}
        preparing={preparing}
        items={frameQueueItems(jobs.jobs)}
        progress={jobs.progress}
        nameOf={(exoId) => exercises.find((ex) => ex.exo_id === exoId)?.display_name ?? ""}
        onGenerate={() => void startQueue()}
        onCancel={() => void jobs.cancelActive()}
        onRetry={() => void jobs.retryFailed()}
        onDismiss={() => void jobs.dismissFinished()}
      />
    </div>
  );
}
