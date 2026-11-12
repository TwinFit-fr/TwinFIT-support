import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  avatarJobs,
  avatarStep,
  equipmentJobs,
  equipmentPollMs,
  formatDuration,
  generationJobs,
  jobAnnouncements,
  jobCounts,
  jobStates,
  jobTiming,
  jobsButtonLabel,
  jobsSummary,
  mergeJobs,
  newlyFinished,
  ordinal,
  tickDelayMs,
  vectorsPollMs,
  watchedExercises,
  type StudioJob,
} from "./jobs.ts";
import type { BaseAvatar, EquipmentModel, MovementVector, StudioEquipment } from "./types.ts";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

function vector(over: Partial<MovementVector>): MovementVector {
  return {
    id: "v1",
    seq: 1,
    exercise_id: "e1",
    avatar_id: "a1",
    prompt: "p",
    equipment: {},
    params: {},
    status: "pending",
    attempts: 0,
    max_attempts: 3,
    not_before: null,
    error: null,
    file_id: null,
    vector_url: null,
    format: "json",
    fps: null,
    frame_count: null,
    duration_ms: null,
    model: null,
    usage: null,
    active: false,
    created_by: null,
    inserted_at: ago(120),
    started_at: null,
    finished_at: null,
    updated_at: ago(120),
    avatar: null,
    ...over,
  };
}

function avatar(over: Partial<BaseAvatar>): BaseAvatar {
  return {
    id: "a1",
    code: "TWINFIT_WOMAN",
    name: "TwinFIT woman",
    subject: "woman",
    file_id: null,
    model_url: null,
    provider: "meshy",
    status: "processing",
    progress: 40,
    task_id: "t",
    rig_task_id: null,
    source_image_url: null,
    error: null,
    usage: null,
    rig: "mixamo",
    height_m: 1.7,
    sockets: [],
    params: {},
    active: true,
    is_default: false,
    inserted_at: ago(200),
    started_at: ago(190),
    finished_at: null,
    updated_at: ago(10),
    ...over,
  };
}

function model(over: Partial<EquipmentModel>): EquipmentModel {
  return {
    id: "m1",
    kind: "load",
    code: "KETTLEBELL",
    name: "Kettlebell",
    provider: "meshy",
    task_id: "t",
    source_image_url: null,
    prompt: null,
    status: "processing",
    progress: 42,
    error: null,
    file_id: null,
    model_url: null,
    thumbnail_file_id: null,
    thumbnail_url: null,
    params: {},
    usage: null,
    active: false,
    inserted_at: ago(100),
    started_at: ago(95),
    finished_at: null,
    updated_at: ago(5),
    ...over,
  };
}

const entry = (models: EquipmentModel[], over: Partial<StudioEquipment> = {}): StudioEquipment => ({
  kind: "load",
  code: "KETTLEBELL",
  name: "Kettlebell",
  description: null,
  reference_image_url: "https://example.test/k.png",
  models,
  ...over,
});

const names = (id: string) => ({ e1: "Air Squat", e2: "Push-Up" })[id] ?? null;
const ctx = { now: NOW, exerciseName: names };

describe("AI movement generations as jobs", () => {
  it("says what, for what, the state and the step of a running row; no Stop once it runs", () => {
    const [job] = generationJobs([vector({ status: "processing", attempts: 1, started_at: ago(72) })], ctx);
    assert.equal(job.what, "AI movement");
    assert.equal(job.subject, "Air Squat #1");
    assert.equal(job.state, "running");
    assert.equal(job.step, "Drafting the poses · attempt 1 of 3");
    assert.deepEqual(job.actions, ["open"]);
    assert.equal(jobTiming(job, NOW), "running 1 min 12 s");
  });

  it("gives waiting rows their place in the global line (lowest seq first, any exercise) and a real Stop", () => {
    const jobs = generationJobs(
      [
        vector({ id: "a", seq: 9, exercise_id: "e2" }),
        vector({ id: "b", seq: 4, exercise_id: "e1" }),
        vector({ id: "c", seq: 2, status: "processing", started_at: ago(5) }),
      ],
      ctx,
    );
    const byId = Object.fromEntries(jobs.map((j) => [j.rowId, j]));
    assert.equal(byId.b.step, "Next in line");
    assert.equal(byId.a.step, "Waiting in the queue · 2nd in line");
    assert.deepEqual(byId.a.actions, ["open", "stop"]);
  });

  it("says the queue is not advancing on waiting rows while the worker fails", () => {
    const [job] = generationJobs([vector({})], { ...ctx, stalled: true });
    assert.equal(job.step, "Waiting · the queue is not advancing");
  });

  it("tells a row waiting for its retry delay apart", () => {
    const [job] = generationJobs([vector({ attempts: 1, not_before: new Date(NOW + 20_000).toISOString() })], ctx);
    assert.equal(job.step, "Waiting to try again · next is attempt 2 of 3");
  });

  it("keeps the whole failure reason and offers retry, open and dismiss", () => {
    const reason = "The model returned poses outside the range of motion: left knee flexion 182° after 3 attempts";
    const [job] = generationJobs([vector({ status: "error", attempts: 3, error: reason, started_at: ago(400), finished_at: ago(300) })], ctx);
    assert.equal(job.state, "failed");
    assert.equal(job.step, reason);
    assert.equal(job.error, reason);
    assert.deepEqual(job.actions, ["retry", "open", "dismiss"]);
    // Putting it back in the queue spends OpenAI usage again: it asks first.
    assert.equal(job.paidRetry, true);
    assert.equal(jobTiming(job, NOW), "took 1 min 40 s · failed 5 min ago");
  });

  it("opens a finished clip in the editor", () => {
    const [job] = generationJobs([vector({ status: "ready", attempts: 1, started_at: ago(90), finished_at: ago(60), duration_ms: 4000, frame_count: 120 })], ctx);
    assert.equal(job.state, "done");
    assert.equal(job.step, "Clip ready · 4.0 s · 120 frames");
    assert.equal(job.openLabel, "Open in editor");
  });

  it("leaves out uploads, saved clips and old outcomes", () => {
    const rows = [
      vector({ id: "upload", not_before: "2999-01-01T00:00:00Z" }),
      vector({ id: "saved", status: "ready", started_at: null, attempts: 0, finished_at: ago(10) }),
      vector({ id: "old", status: "error", attempts: 3, started_at: ago(200_000), finished_at: ago(100_000) }),
    ];
    assert.deepEqual(generationJobs(rows, ctx), []);
  });

  it("counts a row once when two lists carry it", () => {
    assert.equal(generationJobs([vector({}), vector({})], ctx).length, 1);
  });
});

describe("Meshy builds as jobs", () => {
  it("names the avatar step from the service's progress milestones", () => {
    assert.equal(avatarStep(40), "Building the 3D model · 40%");
    assert.equal(avatarStep(70), "Rigging the skeleton · 70%");
    assert.equal(avatarStep(100), "Storing the rigged model");
  });

  it("never offers Stop on a Meshy task and offers 'use' for a finished avatar not on the stage", () => {
    const [run] = avatarJobs([avatar({})], { now: NOW, currentAvatarId: null });
    assert.equal(run.state, "running");
    assert.equal(run.progress, 40);
    assert.deepEqual(run.actions, []);
    const [done] = avatarJobs([avatar({ status: "ready", finished_at: ago(30), params: { bones: { hips: 1, head: 1 } } })], { now: NOW, currentAvatarId: "other" });
    assert.equal(done.step, "Ready · 2 bones recognised");
    assert.deepEqual(done.actions, ["use", "dismiss"]);
    const [inUse] = avatarJobs([avatar({ status: "ready", finished_at: ago(30) })], { now: NOW, currentAvatarId: "a1" });
    assert.deepEqual(inUse.actions, ["dismiss"]);
  });

  it("marks a failed build's retry as paid and ignores uploads and mannequins", () => {
    const jobs = avatarJobs([avatar({ status: "error", error: "Meshy: insufficient credits", finished_at: ago(60) }), avatar({ id: "m", provider: "mannequin", status: "ready" })], { now: NOW, currentAvatarId: null });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].step, "Meshy: insufficient credits");
    assert.equal(jobs[0].paidRetry, true);
  });

  it("lists equipment builds per model and only offers retry when a reference image exists", () => {
    const jobs = equipmentJobs([entry([model({}), model({ id: "m2", status: "error", error: "Meshy task not found", finished_at: ago(20) })], { reference_image_url: null })], { now: NOW });
    assert.equal(jobs[0].step, "Generating the 3D model · 42%");
    assert.deepEqual(jobs[1].actions, ["open", "dismiss"]);
    const [withRef] = equipmentJobs([entry([model({ status: "error", finished_at: ago(20) })])], { now: NOW });
    assert.deepEqual(withRef.actions, ["retry", "open", "dismiss"]);
    assert.equal(withRef.openLabel, "Open in Equipment");
  });
});

describe("one job list", () => {
  const all = (): StudioJob[] =>
    mergeJobs([
      generationJobs([vector({ id: "q" }), vector({ id: "r", status: "processing", started_at: ago(10) }), vector({ id: "f", status: "error", attempts: 3, started_at: ago(50), finished_at: ago(40) })], ctx),
      avatarJobs([avatar({ status: "ready", finished_at: ago(5) })], { now: NOW, currentAvatarId: null }),
    ]);

  it("puts what needs attention first, then running, queued and done", () => {
    assert.deepEqual(all().map((j) => j.state), ["failed", "running", "queued", "done"]);
  });

  it("hides dismissed finished jobs but never a running one", () => {
    const merged = mergeJobs([all()], new Set(["generation:f", "generation:r", "avatar:a1"]));
    assert.deepEqual(merged.map((j) => j.id), ["generation:r", "generation:q"]);
  });

  it("counts and says the counts", () => {
    const counts = jobCounts(all());
    assert.deepEqual(counts, { running: 1, queued: 1, failed: 1, done: 1, active: 2, total: 4 });
    assert.equal(jobsSummary(counts), "1 running · 1 queued · 1 failed · 1 done");
    assert.equal(jobsSummary(jobCounts([])), "No jobs");
    assert.equal(jobsButtonLabel(counts, true), "Jobs: 1 running · 1 queued · 1 failed · 1 done · the queue is not advancing");
    assert.equal(jobsButtonLabel(jobCounts([]), false), "Jobs: none running");
  });

  it("announces changes, not the first list", () => {
    const first = all();
    assert.deepEqual(jobAnnouncements(null, first), []);
    const before = jobStates(first);
    const next = mergeJobs([
      generationJobs([vector({ id: "q", status: "processing", started_at: ago(1) }), vector({ id: "r", status: "ready", attempts: 1, started_at: ago(10), finished_at: ago(0) })], ctx),
    ]);
    assert.deepEqual(jobAnnouncements(before, next), ["AI movement for Air Squat #1 is running.", "AI movement for Air Squat #1 is done."]);
    assert.deepEqual(newlyFinished(before, next), ["generation:r"]);
  });
});

describe("words, polling and the worker", () => {
  it("formats durations and ordinals", () => {
    assert.equal(formatDuration(42_000), "42 s");
    assert.equal(formatDuration(180_000), "3 min");
    assert.equal(formatDuration(185_000), "3 min 5 s");
    assert.equal(formatDuration(185_000, true), "3 min");
    assert.equal(formatDuration(72 * 60_000), "1 h 12 min");
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });

  it("polls equipment and rows only while something runs", () => {
    assert.equal(equipmentPollMs([entry([model({})])]), 4000);
    assert.equal(equipmentPollMs([entry([model({ status: "ready" })])]), 0);
    assert.equal(vectorsPollMs([vector({})]), 3000);
    assert.equal(vectorsPollMs(undefined), 0);
  });

  it("backs off the worker tick while it keeps failing", () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(tickDelayMs), [4000, 4000, 15000, 30000, 60000, 60000]);
  });

  it("keeps watching an exercise once its rows were queued", () => {
    assert.deepEqual(watchedExercises(["b"], ["a"]), ["a", "b"]);
    assert.deepEqual(watchedExercises([], ["a"]), ["a"]);
  });
});

describe("announcing jobs that arrive", () => {
  it("announces a newly queued job, not a running or failed one that arrived with a late list", () => {
    const next = mergeJobs([generationJobs([vector({ id: "n" }), vector({ id: "late", status: "error", attempts: 3, started_at: ago(50), finished_at: ago(40) })], ctx)]);
    assert.deepEqual(jobAnnouncements(new Map(), next), ["AI movement for Air Squat #1 is queued."]);
  });
});
