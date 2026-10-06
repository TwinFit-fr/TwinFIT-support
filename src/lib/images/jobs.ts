import { randomUUID } from "node:crypto";
import { jwtSecondsLeft } from "@/lib/nhost/jwt";
import { staffGql } from "@/lib/staff-gql";
import { generateExerciseFrame } from "./generate-frame";
import { generateMuscleMap } from "./generate-muscle-map";
import { errorMessage, isRetryable } from "./generation-error";
import type { GenerationJob, JobSpec } from "./job-types";
import { jobTarget } from "./job-types";
import { getUserIdFromToken } from "./queries";

const JOB_FIELDS = `
  id seq batch_id style_id kind exo_id subject position muscle_id muscle_group_id view options
  depends_on status attempts max_attempts not_before error result_exercise_image_id
  result_muscle_map_id inserted_at started_at finished_at
`;

/** Requests stop claiming after this long and hand over to a fresh one (maxDuration is 300 s). */
const WORK_BUDGET_MS = 200_000;
/** Workers per drain request; the database caps how many jobs run at once across requests. */
const WORKERS_PER_DRAIN = 3;
/** A drain only chains with a token that outlives one more job. */
const MIN_TOKEN_SECONDS = 90;
/** Finished jobs stay listed this long, so a run's outcome remains on screen. */
const FINISHED_VISIBLE_MINUTES = 30;
/** Seconds before a failed attempt is retried, times the attempt number. */
const RETRY_BACKOFF_SECONDS = 20;

/** Inserts a run; returns its batch id and jobs (in enqueue order). */
export async function enqueueJobs(
  token: string,
  styleId: string,
  specs: JobSpec[],
): Promise<{ batchId: string; jobs: GenerationJob[] }> {
  const batchId = randomUUID();
  const createdBy = getUserIdFromToken(token);
  const idByKey = new Map<string, string>();
  const rows = specs.map((spec) => {
    const id = randomUUID();
    if (spec.kind === "exercise_frame" && spec.key) idByKey.set(spec.key, id);
    return { id, spec };
  });
  const objects = rows.map(({ id, spec }) => {
    const common = {
      id,
      batch_id: batchId,
      style_id: styleId,
      kind: spec.kind,
      options: spec.options ?? {},
      created_by: createdBy,
    };
    if (spec.kind === "muscle_map") {
      return {
        ...common,
        view: spec.view,
        ...(spec.target.kind === "muscle"
          ? { muscle_id: spec.target.id }
          : { muscle_group_id: spec.target.id }),
      };
    }
    const dependsOn = spec.after ? idByKey.get(spec.after) : undefined;
    if (spec.after && !dependsOn) throw new Error(`Unknown job key "${spec.after}"`);
    return {
      ...common,
      exo_id: spec.exoId,
      subject: spec.subject,
      position: spec.position,
      depends_on: dependsOn ?? null,
    };
  });
  // One insert keeps the run's order (seq) and lets later rows depend on earlier ones.
  const data = await staffGql<{ insert_images_generation_jobs: { returning: GenerationJob[] } }>(
    token,
    `mutation($objects: [images_generation_jobs_insert_input!]!) {
      insert_images_generation_jobs(objects: $objects) { returning { ${JOB_FIELDS} } }
    }`,
    { objects },
  );
  const jobs = [...data.insert_images_generation_jobs.returning].sort((a, b) => a.seq - b.seq);
  return { batchId, jobs };
}

/**
 * Jobs to show for a style: every active one plus those finished recently, oldest first.
 * Narrowed to one kind, exercise or target when given.
 */
export async function listJobs(
  token: string,
  filter: { styleId: string; kind?: GenerationJob["kind"]; exoId?: number },
): Promise<GenerationJob[]> {
  const since = new Date(Date.now() - FINISHED_VISIBLE_MINUTES * 60_000).toISOString();
  const where = {
    style_id: { _eq: filter.styleId },
    ...(filter.kind ? { kind: { _eq: filter.kind } } : {}),
    ...(filter.exoId != null ? { exo_id: { _eq: filter.exoId } } : {}),
    _or: [
      { status: { _in: ["queued", "running"] } },
      { finished_at: { _gte: since } },
      { updated_at: { _gte: since } },
    ],
  };
  const data = await staffGql<{ images_generation_jobs: GenerationJob[] }>(
    token,
    `query($where: images_generation_jobs_bool_exp!) {
      images_generation_jobs(where: $where, order_by: { seq: asc }) { ${JOB_FIELDS} }
    }`,
    { where },
  );
  return data.images_generation_jobs;
}

/** Jobs waiting or running across every style, for the keeper and the header indicator. */
export async function countPendingJobs(
  token: string,
): Promise<{ queued: number; running: number }> {
  const data = await staffGql<{ images_generation_jobs: { status: "queued" | "running" }[] }>(
    token,
    `query { images_generation_jobs(where: { status: { _in: ["queued", "running"] } }) { status } }`,
  );
  const jobs = data.images_generation_jobs;
  return {
    queued: jobs.filter((j) => j.status === "queued").length,
    running: jobs.filter((j) => j.status === "running").length,
  };
}

async function updateJobs(token: string, where: object, set: object): Promise<number> {
  const data = await staffGql<{ update_images_generation_jobs: { affected_rows: number } }>(
    token,
    `mutation($where: images_generation_jobs_bool_exp!, $set: images_generation_jobs_set_input!) {
      update_images_generation_jobs(where: $where, _set: $set) { affected_rows }
    }`,
    { where, set },
  );
  return data.update_images_generation_jobs.affected_rows;
}

/** Failed and skipped jobs of a run go back to the queue with fresh attempts. */
export function retryBatch(token: string, batchId: string): Promise<number> {
  return updateJobs(
    token,
    { batch_id: { _eq: batchId }, status: { _eq: "error" } },
    { status: "queued", attempts: 0, error: null, not_before: null, finished_at: null },
  );
}

/** Jobs of a run that have not started are cancelled; running ones finish. */
export function cancelBatch(token: string, batchId: string): Promise<number> {
  return updateJobs(
    token,
    { batch_id: { _eq: batchId }, status: { _eq: "queued" } },
    { status: "cancelled", finished_at: new Date().toISOString() },
  );
}

/** Removes a run's finished jobs from the list (the images they made stay). */
export async function dismissBatch(token: string, batchId: string): Promise<number> {
  const data = await staffGql<{ delete_images_generation_jobs: { affected_rows: number } }>(
    token,
    `mutation($batchId: uuid!) {
      delete_images_generation_jobs(
        where: { batch_id: { _eq: $batchId }, status: { _in: ["done", "error", "cancelled"] } }
      ) { affected_rows }
    }`,
    { batchId },
  );
  return data.delete_images_generation_jobs.affected_rows;
}

async function claimJob(token: string): Promise<GenerationJob | null> {
  const data = await staffGql<{ images_claim_generation_job: GenerationJob[] }>(
    token,
    `mutation { images_claim_generation_job { ${JOB_FIELDS} } }`,
  );
  return data.images_claim_generation_job[0] ?? null;
}

async function resultOf(token: string, jobId: string): Promise<string | undefined> {
  const data = await staffGql<{
    images_generation_jobs_by_pk: { result_exercise_image_id: string | null } | null;
  }>(
    token,
    `query($id: uuid!) { images_generation_jobs_by_pk(id: $id) { result_exercise_image_id } }`,
    { id: jobId },
  );
  return data.images_generation_jobs_by_pk?.result_exercise_image_id ?? undefined;
}

/** Makes the job's image; returns the column and id to record. */
async function runJob(token: string, job: GenerationJob): Promise<Record<string, string>> {
  if (job.kind === "muscle_map") {
    const target = jobTarget(job);
    if (!target || !job.view) throw new Error("Muscle map job without a target or view");
    const image = await generateMuscleMap(token, {
      styleId: job.style_id,
      target,
      view: job.view,
      promptOverride: job.options.promptOverride,
      referenceIds: job.options.referenceIds,
    });
    return { result_muscle_map_id: image.id };
  }
  if (job.exo_id == null || !job.subject || job.position == null) {
    throw new Error("Exercise frame job without an exercise, subject or position");
  }
  // Mid / End of a run edit the Start that run made; otherwise the subject's active Start.
  const guideImageId = job.depends_on ? await resultOf(token, job.depends_on) : undefined;
  const image = await generateExerciseFrame(token, {
    exoId: job.exo_id,
    styleId: job.style_id,
    position: job.position,
    subject: job.subject,
    systemOverride: job.options.systemOverride,
    positionOverride: job.options.positionOverride,
    referenceIds: job.options.referenceIds,
    guideImageId,
  });
  return { result_exercise_image_id: image.id };
}

/** Records a failed attempt: back to the queue after a backoff, or failed for good. */
async function failJob(token: string, job: GenerationJob, error: unknown) {
  const message = errorMessage(error);
  const retry = isRetryable(error) && job.attempts < job.max_attempts;
  await updateJobs(
    token,
    { id: { _eq: job.id } },
    retry
      ? {
          status: "queued",
          error: message,
          not_before: new Date(
            Date.now() + RETRY_BACKOFF_SECONDS * job.attempts * 1000,
          ).toISOString(),
        }
      : { status: "error", error: message, finished_at: new Date().toISOString() },
  );
}

/** Claims and runs jobs until none is runnable or the budget is spent; true if it ran out of time. */
async function work(token: string, deadline: number): Promise<boolean> {
  while (Date.now() < deadline && jwtSecondsLeft(token) > MIN_TOKEN_SECONDS) {
    const job = await claimJob(token);
    if (!job) return false;
    try {
      const result = await runJob(token, job);
      await updateJobs(
        token,
        { id: { _eq: job.id } },
        { ...result, status: "done", error: null, finished_at: new Date().toISOString() },
      );
    } catch (error) {
      await failJob(token, job, error).catch(() => {
        /* the claim's stale-job sweep settles it */
      });
    }
  }
  return true;
}

/** Asks a fresh request to continue draining (its own time budget), with the same token. */
export async function kickDrain(origin: string, token: string): Promise<void> {
  if (jwtSecondsLeft(token) <= MIN_TOKEN_SECONDS) return;
  await fetch(new URL("/api/images/jobs/drain", origin), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => {
    /* open Images pages kick the drain again */
  });
}

/**
 * Processes queued jobs from this request: a few workers claim jobs one at a time (the database
 * caps how many run at once) until none is runnable. When the time budget runs out first, a new
 * request takes over, so long runs span several requests.
 */
export async function drainJobs(token: string, origin: string): Promise<void> {
  const deadline = Date.now() + WORK_BUDGET_MS;
  const outOfTime = await Promise.all(
    Array.from({ length: WORKERS_PER_DRAIN }, () => work(token, deadline).catch(() => false)),
  );
  if (outOfTime.some(Boolean)) await kickDrain(origin, token);
}
