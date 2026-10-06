import type { MuscleMapTargetRef, MuscleMapView, Subject } from "./types";

/**
 * Server-side generation jobs (images.generation_jobs): a run enqueues one job per image and
 * Support processes them on the server, so runs survive leaving the page and retry on failure.
 */

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

/** Per-run edits of an exercise frame: prompt texts and library references. */
export type FrameJobOptions = {
  systemOverride?: string;
  positionOverride?: string;
  /** Omitted = the references linked to the exercise. */
  referenceIds?: string[];
};

/** Per-run edits of a muscle map: prompt text and library references. */
export type MuscleMapJobOptions = {
  promptOverride?: string;
  /** Omitted = the references linked to the target. */
  referenceIds?: string[];
};

export type GenerationJob = {
  id: string;
  seq: number;
  batch_id: string;
  style_id: string;
  kind: "exercise_frame" | "muscle_map";
  exo_id: number | null;
  subject: Subject | null;
  position: number | null;
  muscle_id: string | null;
  muscle_group_id: string | null;
  view: MuscleMapView | null;
  options: FrameJobOptions & MuscleMapJobOptions;
  depends_on: string | null;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  not_before: string | null;
  error: string | null;
  result_exercise_image_id: string | null;
  result_muscle_map_id: string | null;
  inserted_at: string;
  started_at: string | null;
  finished_at: string | null;
};

/**
 * A job as a run asks for it. A frame with `after` waits for the run's frame with that `key`
 * and edits its result (Mid / End after the Start they are drawn from).
 */
export type JobSpec =
  | {
      kind: "exercise_frame";
      key?: string;
      after?: string;
      exoId: number;
      subject: Subject;
      position: number;
      options?: FrameJobOptions;
    }
  | {
      kind: "muscle_map";
      target: MuscleMapTargetRef;
      view: MuscleMapView;
      options?: MuscleMapJobOptions;
    };

/**
 * The frame jobs of a run: per exercise and subject, the chosen positions its sequence has.
 * When the run includes Start, Mid / End wait for it and edit it; otherwise they edit the
 * subject's active Start.
 */
export function frameJobSpecs({
  exercises,
  positions,
  subjects,
  options,
}: {
  exercises: { exoId: number; framePositions: number[] }[];
  positions: number[];
  subjects: Subject[];
  options?: (position: number) => FrameJobOptions;
}): JobSpec[] {
  return exercises.flatMap(({ exoId, framePositions }) =>
    subjects.flatMap((subject) => {
      const run = framePositions.filter((p) => positions.includes(p));
      const key = `${exoId}:${subject}`;
      const withStart = run.includes(0);
      return run.map((position): JobSpec => ({
        kind: "exercise_frame",
        exoId,
        subject,
        position,
        ...(position === 0 ? { key } : withStart ? { after: key } : {}),
        options: options?.(position),
      }));
    }),
  );
}

export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ["queued", "running"];

export function isActiveJob(job: Pick<GenerationJob, "status">): boolean {
  return ACTIVE_JOB_STATUSES.includes(job.status);
}

export function jobTarget(job: GenerationJob): MuscleMapTargetRef | null {
  if (job.muscle_id) return { kind: "muscle", id: job.muscle_id };
  if (job.muscle_group_id) return { kind: "muscle_group", id: job.muscle_group_id };
  return null;
}
