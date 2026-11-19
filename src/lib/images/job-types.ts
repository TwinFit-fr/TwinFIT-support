import type { Subject } from "./types";

/**
 * Server-side generation jobs (images.generation_jobs): a run enqueues one job per image and
 * Support processes them on the server, so runs survive leaving the page and retry on failure.
 */

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

/**
 * Edit an existing image of the job's target with an instruction. Every job makes a candidate
 * (inactive, no position, review pending); publishing a sequence is a separate step.
 */
export type ImageEditOptions = { editOf?: string; instruction?: string };

/** Automatic inputs of an exercise frame a run can leave out. */
export type SkippableInput = "character" | "support" | "logo";

export const SKIPPABLE_INPUTS: readonly SkippableInput[] = ["character", "support", "logo"];

/** Per-run edits of an exercise frame: prompt texts, library references and inputs left out. */
export type FrameJobOptions = {
  systemOverride?: string;
  positionOverride?: string;
  /** Omitted = the references linked to the exercise. */
  referenceIds?: string[];
  /** Automatic inputs not sent this time (the style still has them). */
  skipInputs?: SkippableInput[];
  /**
   * Mid / End of a run without Start: the Start to edit (a candidate or the active one). Omitted
   * = the subject's active Start. Ignored when the job depends on a Start of its own run.
   */
  guideImageId?: string;
  /** No feet-baseline shift: the frame is aligned to its Start later. */
  skipAlign?: boolean;
} & ImageEditOptions;

export type GenerationJob = {
  id: string;
  seq: number;
  batch_id: string;
  style_id: string;
  kind: "exercise_frame";
  exo_id: number | null;
  subject: Subject | null;
  position: number | null;
  options: FrameJobOptions;
  depends_on: string | null;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  not_before: string | null;
  error: string | null;
  result_exercise_image_id: string | null;
  inserted_at: string;
  started_at: string | null;
  finished_at: string | null;
};

/**
 * A job as a run asks for it. A frame with `after` waits for the run's frame with that `key`
 * and edits its result (Mid / End after the Start they are drawn from).
 */
export type JobSpec = {
  kind: "exercise_frame";
  key?: string;
  after?: string;
  exoId: number;
  subject: Subject;
  position: number;
  options?: FrameJobOptions;
};

/**
 * The frame jobs of a run: per exercise and subject, the chosen positions its sequence has, once
 * per variant. When the run includes Start, Mid / End wait for the Start of their variant and edit
 * it, so each variant is a coherent sequence; otherwise they edit the Start the options give
 * (`guideImageId`) or the subject's active one. Every job makes a candidate: nothing is replaced.
 */
export function frameJobSpecs({
  exercises,
  positions,
  subjects,
  options,
  variants = 1,
}: {
  exercises: { exoId: number; framePositions: number[] }[];
  positions: number[];
  subjects: Subject[];
  options?: (position: number, subject: Subject) => FrameJobOptions;
  variants?: number;
}): JobSpec[] {
  return exercises.flatMap(({ exoId, framePositions }) =>
    subjects.flatMap((subject) => {
      const run = framePositions.filter((p) => positions.includes(p));
      const withStart = run.includes(0);
      return Array.from({ length: variants }, (_, variant) => {
        const key = `${exoId}:${subject}:${variant}`;
        return run.map(
          (position): JobSpec => ({
            kind: "exercise_frame",
            exoId,
            subject,
            position,
            ...(position === 0 ? { key } : withStart ? { after: key } : {}),
            options: options?.(position, subject),
          }),
        );
      }).flat();
    }),
  );
}

export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ["queued", "running"];

export function isActiveJob(job: Pick<GenerationJob, "status">): boolean {
  return ACTIVE_JOB_STATUSES.includes(job.status);
}
