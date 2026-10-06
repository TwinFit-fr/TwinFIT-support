"use client";

import { useMemo, useState } from "react";
import { mutate } from "swr";
import { Search } from "lucide-react";
import { Input, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import {
  BOARD_GRID,
  EmptyState,
  StatusTabs,
  statusCounts,
  type StatusFilter,
} from "@/components/images/board-ui";
import { ExerciseImageCard } from "@/components/images/exercise-image-card";
import { GenerationQueueBar } from "@/components/images/generation-queue-bar";
import { StyleSelector, runPositionsFor } from "@/components/images/position-selector";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  useFrameCountChoice,
  useGenerationQueue,
  usePositionSelection,
  useStyleChoice,
  useSubjectSelection,
} from "@/hooks/use-generation-queue";
import { DEFAULT_MAX_CONCURRENCY } from "@/lib/images/capabilities";
import { MID_POSITION, framePositionsFor } from "@/lib/images/types";
import type {
  ExerciseImage,
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
  const { data: stylesData } = useStaffSWR<{ styles: ImageStyle[] }>("/api/images/styles");
  const styles = stylesData?.styles ?? [];
  const defaultStyleId = styles.find((s) => s.is_default)?.id ?? null;
  const [styleId, setStyleId] = useStyleChoice(defaultStyleId);
  const listKey = styleId ? `/api/images/exercises?style=${styleId}` : null;
  const { data, isLoading, error } = useStaffSWR<ListResponse>(listKey, {
    refreshInterval: 8000,
  });
  const [positions, setPositions] = usePositionSelection();
  const [subjects, setSubjects] = useSubjectSelection();
  const [frameCount, setFrameCount] = useFrameCountChoice();
  const [preparing, setPreparing] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [muscle, setMuscle] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const queue = useGenerationQueue();

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (status !== "all" && ex.status !== status) return false;
      if (muscle !== "all" && ex.primary_muscle_group?.id !== muscle) return false;
      if (equipment !== "all" && ex.equipment?.id !== equipment) return false;
      if (!q) return true;
      return ex.display_name.toLowerCase().includes(q) || String(ex.exo_id).includes(q);
    });
  }, [exercises, search, status, muscle, equipment]);

  const counts = useMemo(() => statusCounts(exercises.map((ex) => ex.status)), [exercises]);

  // With a batch frame count, positions it lacks (Mid for 2 frames) are not offered.
  const batchPositions = frameCount === "exercise" ? undefined : framePositionsFor(frameCount === 2);
  const runPositions = batchPositions ? runPositionsFor(positions, batchPositions) : positions;
  const selectedExercises = filtered.filter((ex) => selected.has(ex.exo_id));
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

  function toggle(exoId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(exoId)) next.delete(exoId);
      else next.add(exoId);
      return next;
    });
  }

  function selectFiltered() {
    setSelected(new Set(filtered.map((ex) => ex.exo_id)));
  }

  async function generateStep(
    exoId: number,
    position: number,
    stepSubject: Subject,
    guideImageId?: string,
  ): Promise<string> {
    if (!styleId) throw new Error("Select a style first");
    const { image } = (await staffFetch("/api/images/generate", {
      method: "POST",
      body: JSON.stringify({
        exoId,
        styleId,
        position,
        subject: stepSubject,
        guideImageId,
      }),
    })) as { image: ExerciseImage };
    if (listKey) await mutate(listKey);
    return image.id;
  }

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
      !window.confirm(
        `${losingMid.length} exercise(s) have an active Mid frame. Switching them to 2 frames deactivates it. Continue?`,
      )
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
    try {
      if (!(await applyFrameCount(runnableExercises))) return;
      await queue.start({
        exercises: runnableExercises.map((ex) => ({
          exoId: ex.exo_id,
          name: ex.display_name,
          framePositions: framePositionsOf(ex),
        })),
        positions: runPositions,
        subjects,
        maxConcurrency: DEFAULT_MAX_CONCURRENCY,
        generateStep,
      });
      success(`${runnableExercises.length} exercise(s) processed`, "Queue finished");
      if (listKey) await mutate(listKey);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed", "Queue error");
    }
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((ex) => selected.has(ex.exo_id));

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Exercises</h1>
        <StyleSelector
          styles={styles}
          value={styleId}
          onChange={setStyleId}
          disabled={queue.running || preparing}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusTabs value={status} onChange={setStatus} counts={counts} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or #id"
              className="h-8 w-56 py-1 pl-8 text-xs"
            />
          </div>
          <FilterSelect value={muscle} onChange={setMuscle} allLabel="All muscles">
            {muscleOptions}
          </FilterSelect>
          <FilterSelect value={equipment} onChange={setEquipment} allLabel="All equipment">
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
              onClick={allFilteredSelected ? () => setSelected(new Set()) : selectFiltered}
              className="font-medium text-zinc-600 hover:text-zinc-900"
            >
              {allFilteredSelected ? "Deselect all" : "Select all"}
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
              selected={selected.has(ex.exo_id)}
              selecting={selected.size > 0}
              onToggle={() => toggle(ex.exo_id)}
            />
          ))}
        </div>
      )}

      <GenerationQueueBar
        selectedCount={selected.size}
        onClearSelection={() => setSelected(new Set())}
        plannedImages={plannedImages}
        withoutStart={withoutStart}
        frameCount={frameCount}
        onFrameCountChange={setFrameCount}
        positions={positions}
        availablePositions={batchPositions}
        onPositionsChange={setPositions}
        subjects={subjects}
        onSubjectsChange={setSubjects}
        running={queue.running}
        preparing={preparing}
        items={queue.items}
        exercisesDone={queue.exercisesDone}
        imagesDone={queue.imagesDone}
        imagesTotal={queue.imagesTotal}
        errors={queue.errors}
        onGenerate={() => void startQueue()}
        onCancel={queue.cancel}
      />
    </div>
  );
}
