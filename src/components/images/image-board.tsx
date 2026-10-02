"use client";

import { useMemo, useState } from "react";
import { mutate } from "swr";
import { Button, Input, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ExerciseImageCard } from "@/components/images/exercise-image-card";
import { GenerationQueueBar } from "@/components/images/generation-queue-bar";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  useFrameCountChoice,
  useGenerationQueue,
  usePositionSelection,
  useSubjectChoice,
} from "@/hooks/use-generation-queue";
import { runPositionsFor } from "@/components/images/position-selector";
import { sequenceStripSize } from "@/lib/images/capabilities";
import { MID_POSITION, framePositionsFor } from "@/lib/images/types";
import type {
  ExerciseImageBoardItem,
  ImagePrompt,
  ImageSettings,
  Subject,
} from "@/lib/images/types";

type ListResponse = { exercises: ExerciseImageBoardItem[]; count: number };

export function ImageBoard() {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const { data, isLoading, error } = useStaffSWR<ListResponse>("/api/images/exercises", {
    refreshInterval: 8000,
  });
  const [positions, setPositions] = usePositionSelection();
  const [subject, setSubject] = useSubjectChoice();
  const [frameCount, setFrameCount] = useFrameCountChoice();
  const [preparing, setPreparing] = useState(false);
  const { data: settings } = useStaffSWR<ImageSettings>("/api/images/settings");
  const { data: promptsData } = useStaffSWR<{ system: ImagePrompt[] }>("/api/images/prompts");
  // Ephemeral: applies to the next queue runs on this page only.
  const [systemPromptId, setSystemPromptId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [muscle, setMuscle] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const queue = useGenerationQueue();

  const exercises = data?.exercises ?? [];

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

  const counts = useMemo(() => {
    const c = {
      all: exercises.length,
      empty: 0,
      partial: 0,
      complete: 0,
      inactive_only: 0,
    };
    for (const ex of exercises) {
      if (ex.status in c) c[ex.status as keyof typeof c] += 1;
    }
    return c;
  }, [exercises]);

  // With a batch frame count, positions it lacks (Mid for 2 frames) are not offered.
  const batchPositions = frameCount === "exercise" ? undefined : framePositionsFor(frameCount === 2);
  const runPositions = batchPositions ? runPositionsFor(positions, batchPositions) : positions;
  const selectedExercises = filtered.filter((ex) => selected.has(ex.exo_id));
  const framePositionsOf = (ex: ExerciseImageBoardItem) => batchPositions ?? ex.frame_positions;
  const plannedImages = selectedExercises.reduce(
    (sum, ex) => sum + framePositionsOf(ex).filter((p) => runPositions.includes(p)).length,
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

  function selectEmpty() {
    setSelected(new Set(filtered.filter((ex) => ex.status === "empty").map((ex) => ex.exo_id)));
  }

  async function generateStep(exoId: number, position: number, stepSubject: Subject) {
    await staffFetch("/api/images/generate", {
      method: "POST",
      body: JSON.stringify({ exoId, position, subject: stepSubject, systemPromptId }),
    });
    await mutate("/api/images/exercises");
  }

  async function generateSequence(exoId: number, stepSubject: Subject) {
    await staffFetch("/api/images/generate-sequence", {
      method: "POST",
      body: JSON.stringify({ exoId, subject: stepSubject, systemPromptId }),
    });
    await mutate("/api/images/exercises");
  }

  /** Saves the batch frame count on the exercises that differ; false if the user backs out. */
  async function applyFrameCount(exercises: ExerciseImageBoardItem[]): Promise<boolean> {
    if (frameCount === "exercise") return true;
    const twoFrames = frameCount === 2;
    const changing = exercises.filter((ex) => ex.two_frames !== twoFrames);
    if (!changing.length) return true;
    const losingMid = changing.filter((ex) => ex.active_positions.includes(MID_POSITION));
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
            staffFetch(`/api/images/exercises/${ex.exo_id}`, {
              method: "PATCH",
              body: JSON.stringify({ two_frames: twoFrames }),
            }),
          ),
        );
      }
      return true;
    } finally {
      setPreparing(false);
      await mutate("/api/images/exercises");
    }
  }

  async function startQueue() {
    if (!selectedExercises.length || preparing) return;
    try {
      if (!(await applyFrameCount(selectedExercises))) return;
      await queue.start({
        exercises: selectedExercises.map((ex) => ({
          exoId: ex.exo_id,
          name: ex.display_name,
          framePositions: framePositionsOf(ex),
        })),
        positions: runPositions,
        subject,
        maxConcurrency: settings?.params.max_concurrency ?? 3,
        generateStep,
        generateSequence,
        canSequence: (panels) => Boolean(settings && sequenceStripSize(settings.params, panels)),
      });
      success(`${selectedExercises.length} exercise(s) processed`, "Queue finished");
      await mutate("/api/images/exercises");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed", "Queue error");
    }
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Images</h1>
          <p className="text-sm text-zinc-500">
            Generate frames, assign positions 0/1/2, and activate for GIF sequences.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", `All (${counts.all})`],
            ["empty", `Empty (${counts.empty})`],
            ["partial", `Partial (${counts.partial})`],
            ["complete", `Complete (${counts.complete})`],
            ["inactive_only", `Inactive only (${counts.inactive_only})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStatus(id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === id
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or exo id…"
        />
        <select
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={muscle}
          onChange={(e) => setMuscle(e.target.value)}
        >
          <option value="all">All muscle groups</option>
          {muscleOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
        >
          <option value="all">All equipment</option>
          {equipmentOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={selectFiltered}>
            Select filtered
          </Button>
          <Button type="button" variant="secondary" onClick={selectEmpty}>
            Empty only
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((ex) => (
            <ExerciseImageCard
              key={ex.id}
              exercise={ex}
              selected={selected.has(ex.exo_id)}
              onToggle={() => toggle(ex.exo_id)}
            />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500">
          No exercises match these filters.
        </div>
      )}

      <GenerationQueueBar
        selectedCount={selected.size}
        plannedImages={plannedImages}
        frameCount={frameCount}
        onFrameCountChange={setFrameCount}
        positions={positions}
        availablePositions={batchPositions}
        onPositionsChange={setPositions}
        subject={subject}
        onSubjectChange={setSubject}
        systemPrompts={promptsData?.system ?? []}
        settingsSystemPromptId={settings?.system_prompt_id}
        systemPromptId={systemPromptId}
        onSystemPromptChange={setSystemPromptId}
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
