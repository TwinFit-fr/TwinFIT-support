/**
 * One model for every background job of the Studio: AI movement generations in the queue, Meshy
 * avatar builds and Meshy equipment builds. The rows of the three lists are normalised here into
 * StudioJob, with the words the jobs tray shows (what it is, for what, its state and step), the
 * actions that are honest for each state, the counts of the top-bar button and the sentences the
 * live region announces. Pure: no React, no fetch, `now` is always passed in.
 */

import type { BaseAvatar, EquipmentModel, MovementVector, StudioEquipment, VectorStatus } from "./types.ts";

export type JobKind = "generation" | "avatar" | "equipment";
export type JobState = "queued" | "running" | "done" | "failed";
/** open: the result or the row it belongs to; use: put a finished avatar on the stage; stop: only where it really stops the job. */
export type JobAction = "open" | "retry" | "stop" | "use" | "dismiss";

export type StudioJob = {
  /** `${kind}:${row id}`, stable across polls (dismissals are kept by it). */
  id: string;
  kind: JobKind;
  rowId: string;
  /** What it is, in words ("AI movement"). */
  what: string;
  /** What it belongs to: the exercise, the avatar or the implement. */
  subject: string;
  state: JobState;
  /** What it is doing now, or how it ended (the whole failure reason for a failed job). */
  step: string;
  /** 0–100 when the provider reports it, null when it cannot be known. */
  progress: number | null;
  insertedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  actions: JobAction[];
  /** Label of the "open" action ("Open in editor", "Show in queue", "Open in Equipment"). */
  openLabel: string | null;
  /** Retry spends provider credits or usage (it goes through the paid confirmation): Meshy for builds, OpenAI for an AI movement. */
  paidRetry: boolean;
  /** The language model an AI movement was asked of, when its row names one. */
  model?: string;
  exerciseId?: string;
  vectorId?: string;
  avatarId?: string;
  equipment?: { kind: StudioEquipment["kind"]; code: string; name: string; prompt: string | null };
};

export const JOB_STATE_LABEL: Record<JobState, string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
};

export const JOB_KIND_LABEL: Record<JobKind, string> = {
  generation: "AI movement",
  avatar: "Avatar build",
  equipment: "Equipment model",
};

/** Finished and failed jobs stay in the tray this long (or until dismissed). */
export const RECENT_MS = 24 * 60 * 60 * 1000;
/** The queue is called "not advancing" after this many worker ticks failed in a row. */
export const STALL_AFTER_FAILURES = 2;
/** Normal worker tick. */
export const WORKER_TICK_MS = 4000;
/** Poll of a list while one of its jobs runs. */
export const QUEUE_POLL_MS = 3000;
export const AVATAR_POLL_MS = 5000;
export const EQUIPMENT_POLL_MS = 4000;

const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const running = (status: VectorStatus) => status === "pending" || status === "processing";

/** A finished row still worth showing: it ended less than RECENT_MS ago. */
function recent(finished: number | null, now: number): boolean {
  return finished !== null && now - finished < RECENT_MS;
}

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

/** "42 s", "3 min 5 s", "1 h 12 min"; `coarse` drops the seconds after the first minute ("6 min"). */
export function formatDuration(ms: number, coarse = false): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 && !coarse ? `${m} min ${s % 60} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

// ---- AI movement generations --------------------------------------------------------------

/**
 * A row the worker produced or will produce. Uploads are held out of the worker's reach with a
 * far `not_before` while their file goes up, and land ready without ever being started: neither
 * is a generation.
 */
export function isGenerationRow(v: MovementVector, now: number): boolean {
  if (running(v.status)) {
    const notBefore = time(v.not_before);
    return notBefore === null || notBefore - now < RECENT_MS;
  }
  return v.started_at !== null || v.attempts > 0;
}

export type GenerationContext = {
  now: number;
  /** Exercise name by id (the catalog). */
  exerciseName: (id: string) => string | null;
  /** The worker ticks are failing: waiting rows say so instead of looking healthy. */
  stalled?: boolean;
};

/** AI movement jobs from movement rows of any exercises (rows may repeat; the first one wins). */
export function generationJobs(vectors: readonly MovementVector[], ctx: GenerationContext): StudioJob[] {
  const { now } = ctx;
  const seen = new Set<string>();
  const rows = vectors.filter((v) => {
    if (seen.has(v.id) || !isGenerationRow(v, now)) return false;
    seen.add(v.id);
    return true;
  });
  // The worker claims the lowest seq of the rows that may run now, whatever the exercise.
  const line = rows
    .filter((v) => v.status === "pending" && !waitingToRetry(v, now))
    .sort((a, b) => a.seq - b.seq)
    .map((v) => v.id);

  const jobs: StudioJob[] = [];
  for (const v of rows) {
    const insertedAt = time(v.inserted_at) ?? now;
    const startedAt = time(v.started_at);
    const finishedAt = time(v.finished_at) ?? (running(v.status) ? null : time(v.updated_at));
    if (!running(v.status) && !recent(finishedAt, now)) continue;
    const exercise = ctx.exerciseName(v.exercise_id) ?? "an exercise";
    const attempt = `attempt ${Math.max(1, v.attempts)} of ${Math.max(1, v.max_attempts)}`;
    let state: JobState;
    let step: string;
    let actions: JobAction[];
    let openLabel = "Show in queue";
    if (v.status === "processing") {
      state = "running";
      step = `Drafting the poses · ${attempt}`;
      // A running request cannot be called back: no Stop.
      actions = ["open"];
    } else if (v.status === "pending") {
      state = "queued";
      if (waitingToRetry(v, now)) step = `Waiting to try again · next is attempt ${v.attempts + 1} of ${Math.max(1, v.max_attempts)}`;
      else if (ctx.stalled) step = "Waiting · the queue is not advancing";
      else {
        const position = line.indexOf(v.id);
        step = position === 0 ? "Next in line" : `Waiting in the queue · ${ordinal(position + 1)} in line`;
      }
      // The worker only claims pending rows: taking it out before the claim really stops it.
      actions = ["open", "stop"];
    } else if (v.status === "ready") {
      state = "done";
      const seconds = v.duration_ms ? `${(v.duration_ms / 1000).toFixed(1)} s` : null;
      step = ["Clip ready", seconds, v.frame_count ? `${v.frame_count} frames` : null].filter(Boolean).join(" · ");
      actions = ["open", "dismiss"];
      openLabel = "Open in editor";
    } else {
      state = "failed";
      step = v.error?.trim() || "The generation failed without a reason";
      actions = ["retry", "open", "dismiss"];
    }
    jobs.push({
      id: `generation:${v.id}`,
      kind: "generation",
      rowId: v.id,
      what: JOB_KIND_LABEL.generation,
      subject: `${exercise} #${v.seq}`,
      state,
      step,
      progress: null,
      insertedAt,
      startedAt,
      finishedAt: running(v.status) ? null : finishedAt,
      error: state === "failed" ? step : null,
      actions,
      openLabel,
      paidRetry: true,
      ...(typeof v.params?.model === "string" && v.params.model.trim() ? { model: v.params.model.trim() } : {}),
      exerciseId: v.exercise_id,
      vectorId: v.id,
      avatarId: v.avatar_id,
    });
  }
  return jobs;
}

function waitingToRetry(v: MovementVector, now: number): boolean {
  const notBefore = time(v.not_before);
  return v.status === "pending" && v.attempts > 0 && notBefore !== null && notBefore > now;
}

// ---- Meshy avatar builds ------------------------------------------------------------------

/** Progress milestones of avatar-service.ts: image-to-3D fills 0–55, rigging 58–99, storing at 100. */
export function avatarStep(progress: number): string {
  if (progress >= 100) return "Storing the rigged model";
  if (progress > 55) return `Rigging the skeleton · ${progress}%`;
  return `Building the 3D model · ${progress}%`;
}

export function avatarJobs(avatars: readonly BaseAvatar[], ctx: { now: number; currentAvatarId: string | null }): StudioJob[] {
  const { now } = ctx;
  const jobs: StudioJob[] = [];
  for (const a of avatars) {
    if (a.provider !== "meshy") continue;
    const finishedAt = running(a.status) ? null : (time(a.finished_at) ?? time(a.updated_at));
    if (!running(a.status) && !recent(finishedAt, now)) continue;
    let state: JobState;
    let step: string;
    let actions: JobAction[];
    if (a.status === "pending") {
      state = "queued";
      step = "Waiting to start on Meshy";
      actions = [];
    } else if (a.status === "processing") {
      state = "running";
      step = avatarStep(a.progress);
      // Meshy has no cancel for a task it accepted: no Stop.
      actions = [];
    } else if (a.status === "ready") {
      state = "done";
      const bones = Object.keys((a.params?.bones as object | undefined) ?? {}).length;
      step = a.id === ctx.currentAvatarId ? "Ready · on the stage now" : `Ready${bones ? ` · ${bones} bones recognised` : ""}`;
      actions = a.id === ctx.currentAvatarId ? ["dismiss"] : ["use", "dismiss"];
    } else {
      state = "failed";
      step = a.error?.trim() || "The build failed without a reason";
      actions = ["retry", "dismiss"];
    }
    jobs.push({
      id: `avatar:${a.id}`,
      kind: "avatar",
      rowId: a.id,
      what: JOB_KIND_LABEL.avatar,
      subject: a.name,
      state,
      step,
      progress: a.status === "processing" ? clampPercent(a.progress) : null,
      insertedAt: time(a.inserted_at) ?? now,
      startedAt: time(a.started_at),
      finishedAt,
      error: state === "failed" ? step : null,
      actions,
      openLabel: null,
      paidRetry: true,
      avatarId: a.id,
    });
  }
  return jobs;
}

// ---- Meshy equipment builds ---------------------------------------------------------------

export function equipmentJobs(equipment: readonly StudioEquipment[], ctx: { now: number }): StudioJob[] {
  const { now } = ctx;
  const jobs: StudioJob[] = [];
  for (const entry of equipment) {
    for (const m of entry.models) {
      if (m.provider !== "meshy") continue;
      const finishedAt = running(m.status) ? null : (time(m.finished_at) ?? time(m.updated_at));
      if (!running(m.status) && !recent(finishedAt, now)) continue;
      const { state, step, actions } = equipmentState(m, Boolean(entry.reference_image_url));
      jobs.push({
        id: `equipment:${m.id}`,
        kind: "equipment",
        rowId: m.id,
        what: JOB_KIND_LABEL.equipment,
        subject: entry.name,
        state,
        step,
        progress: m.status === "processing" ? clampPercent(m.progress) : null,
        insertedAt: time(m.inserted_at) ?? now,
        startedAt: time(m.started_at),
        finishedAt,
        error: state === "failed" ? step : null,
        actions,
        openLabel: "Open in Equipment",
        paidRetry: true,
        equipment: { kind: entry.kind, code: entry.code, name: entry.name, prompt: m.prompt },
      });
    }
  }
  return jobs;
}

function equipmentState(m: EquipmentModel, hasReference: boolean): { state: JobState; step: string; actions: JobAction[] } {
  if (m.status === "pending") return { state: "queued", step: "Waiting to start on Meshy", actions: ["open"] };
  if (m.status === "processing") {
    return { state: "running", step: m.progress >= 100 ? "Storing the model" : `Generating the 3D model · ${m.progress}%`, actions: ["open"] };
  }
  if (m.status === "ready") return { state: "done", step: m.active ? "Ready · in use in the viewer" : "Ready · not in use yet", actions: ["open", "dismiss"] };
  // A retry starts again from the catalog reference image, so it needs one.
  return { state: "failed", step: m.error?.trim() || "The build failed without a reason", actions: hasReference ? ["retry", "open", "dismiss"] : ["open", "dismiss"] };
}

const clampPercent = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

// ---- one list ---------------------------------------------------------------------------

const STATE_RANK: Record<JobState, number> = { failed: 0, running: 1, queued: 2, done: 3 };

/** The jobs of every source in one list, without the dismissed finished ones: failed first, then running, queued, done. */
export function mergeJobs(lists: readonly (readonly StudioJob[])[], dismissed: ReadonlySet<string> = new Set()): StudioJob[] {
  const all = lists.flat().filter((j) => !(dismissed.has(j.id) && (j.state === "done" || j.state === "failed")));
  return all.sort((a, b) => {
    const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
    if (rank) return rank;
    // Queued in arrival order (the queue's own order); the rest newest first.
    if (a.state === "queued") return a.insertedAt - b.insertedAt;
    return (b.finishedAt ?? b.startedAt ?? b.insertedAt) - (a.finishedAt ?? a.startedAt ?? a.insertedAt);
  });
}

export type JobCounts = { running: number; queued: number; failed: number; done: number; active: number; total: number };

export function jobCounts(jobs: readonly StudioJob[]): JobCounts {
  const c = { running: 0, queued: 0, failed: 0, done: 0 };
  for (const j of jobs) c[j.state] += 1;
  return { ...c, active: c.running + c.queued, total: jobs.length };
}

/** "2 running · 1 queued · 1 failed", or "No jobs". */
export function jobsSummary(counts: JobCounts, stalled = false): string {
  const parts = [
    counts.running ? `${counts.running} running` : "",
    counts.queued ? `${counts.queued} queued` : "",
    counts.failed ? `${counts.failed} failed` : "",
    counts.done ? `${counts.done} done` : "",
  ].filter(Boolean);
  const text = parts.length ? parts.join(" · ") : "No jobs";
  return stalled ? `${text} · the queue is not advancing` : text;
}

/** The top-bar button's name: what runs and what needs attention. */
export function jobsButtonLabel(counts: JobCounts, stalled: boolean): string {
  const attention = counts.failed + (stalled ? 1 : 0);
  if (!counts.active && !attention) return counts.done ? `Jobs: ${counts.done} done` : "Jobs: none running";
  return `Jobs: ${jobsSummary(counts, stalled)}`;
}

/** How long it has been going (running, waiting) or how it went (took, ago). */
export function jobTiming(job: StudioJob, now: number): string {
  if (job.state === "running") return `running ${formatDuration(now - (job.startedAt ?? job.insertedAt))}`;
  if (job.state === "queued") return `waiting ${formatDuration(now - job.insertedAt)}`;
  const end = job.finishedAt ?? now;
  const took = job.startedAt !== null ? `took ${formatDuration(end - job.startedAt)} · ` : "";
  const ago = now - end < 10_000 ? "just now" : `${formatDuration(now - end, true)} ago`;
  return `${took}${job.state === "done" ? "finished" : "failed"} ${ago}`;
}

/** Id → state, what the announcer compares between two polls. */
export function jobStates(jobs: readonly StudioJob[]): Map<string, JobState> {
  return new Map(jobs.map((j) => [j.id, j.state]));
}

/**
 * Sentences for a polite live region: a job that appeared, started, finished or failed since the
 * previous list. Nothing on the first list (that is what was already there, not a change).
 */
export function jobAnnouncements(previous: ReadonlyMap<string, JobState> | null, next: readonly StudioJob[]): string[] {
  if (!previous) return [];
  const out: string[] = [];
  for (const j of next) {
    const before = previous.get(j.id);
    if (before === j.state) continue;
    const name = `${j.what} for ${j.subject}`;
    // A job not seen before is news only when it was just queued (a list arriving late is not a change).
    if (!before) {
      if (j.state === "queued") out.push(`${name} is queued.`);
    } else if (j.state === "failed") out.push(`${name} failed: ${j.step}`);
    else if (j.state === "done") out.push(`${name} is done.`);
    else if (j.state === "running") out.push(`${name} is running.`);
  }
  return out;
}

/** Ids that turned done or failed since the previous list (the button marks them until the tray is opened). */
export function newlyFinished(previous: ReadonlyMap<string, JobState> | null, next: readonly StudioJob[]): string[] {
  if (!previous) return [];
  return next.filter((j) => (j.state === "done" || j.state === "failed") && previous.get(j.id) !== j.state && previous.has(j.id)).map((j) => j.id);
}

// ---- polling and the worker ---------------------------------------------------------------

/** The avatars list advances Meshy builds: poll it while one runs. */
export function avatarsPollMs(avatars: readonly BaseAvatar[] | undefined): number {
  return avatars?.some((a) => running(a.status)) ? AVATAR_POLL_MS : 0;
}

/** The equipment list advances Meshy builds: poll it while one runs, whatever dialog is open. */
export function equipmentPollMs(equipment: readonly StudioEquipment[] | undefined): number {
  return equipment?.some((e) => e.models.some((m) => running(m.status))) ? EQUIPMENT_POLL_MS : 0;
}

/** Movement rows poll while one of them waits or runs. */
export function vectorsPollMs(vectors: readonly MovementVector[] | undefined): number {
  return vectors?.some((v) => running(v.status)) ? QUEUE_POLL_MS : 0;
}

/** The worker tick interval: normal, then backing off while ticks keep failing (15 s, 30 s, 60 s at most). */
export function tickDelayMs(failures: number): number {
  if (failures < STALL_AFTER_FAILURES) return WORKER_TICK_MS;
  return Math.min(60_000, 15_000 * 2 ** (failures - STALL_AFTER_FAILURES));
}

/** Exercises whose rows the tray watches: queued anywhere now, plus the ones already watched (so their outcome shows). */
export function watchedExercises(queuedNow: readonly string[], watched: readonly string[]): string[] {
  const all = new Set([...watched, ...queuedNow]);
  return [...all].sort();
}
