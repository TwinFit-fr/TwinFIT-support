/**
 * The movement pipeline, pose-based: claim a pending vector, read the three catalog poses of its
 * exercise, have the LLM write them as anatomical angles, store the keyframes as a `json` clip in
 * 3d-workspace and mark the row ready. No video, no motion-capture provider: the viewer solves the
 * angles on the avatar's rig. Server side, with the staff JWT; a tick processes one row.
 */

import { keyframesFromPoses, type PoseClipJson } from "./anatomy";
import { extractPoseAngles } from "./pose-llm";
import { equipmentSentence } from "./prompt";
import {
  claimMovementVector,
  getAvatar,
  getExercisePoses,
  getWorkerExercise,
  updateVector,
} from "./queries";
import { uploadStudioFile } from "./storage";
import type { MovementVector } from "./types";

const RETRY_DELAY_MS = 30_000;
const WORKER_MODEL = "studio-poses";

export type TickResult =
  | { claimed: false }
  | { claimed: true; vector: MovementVector; outcome: "ready" | "retry" | "error"; message?: string };

/** One run of one vector. Errors go back to the row: pending with a delay while attempts remain, else error. */
export async function runWorkerTick(token: string): Promise<TickResult> {
  const vector = await claimMovementVector(token);
  if (!vector) return { claimed: false };
  try {
    const updated = await processVector(token, vector);
    return { claimed: true, vector: updated, outcome: "ready" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The pipeline failed";
    const retry = vector.attempts < vector.max_attempts;
    const updated = await updateVector(token, vector.id, {
      status: retry ? "pending" : "error",
      error: message,
      not_before: retry ? new Date(Date.now() + RETRY_DELAY_MS).toISOString() : null,
    });
    return { claimed: true, vector: updated, outcome: retry ? "retry" : "error", message };
  }
}

async function processVector(token: string, vector: MovementVector): Promise<MovementVector> {
  const [exercise, avatar] = await Promise.all([getWorkerExercise(token, vector.exercise_id), getAvatar(token, vector.avatar_id)]);
  if (!exercise) throw new Error("The exercise no longer exists");
  if (!avatar) throw new Error("The avatar no longer exists");
  const poses = await getExercisePoses(token, exercise.exo_id);
  if (poses.length !== 3) throw new Error(`Exercise #${exercise.exo_id} has ${poses.length} poses instead of 3 (images.exercise_poses)`);

  const fps = clampInt(Number(vector.params.fps ?? 30), 1, 120);
  const durationS = clampNumber(Number(vector.params.duration_s ?? 4), 0.5, 60);
  const loop = vector.params.loop !== false;
  const llmModel = typeof vector.params.model === "string" ? vector.params.model : null;

  const items = vector.equipment.items ?? [];
  // A load held in both hands (socket + socket_b): the implement leads and the arms reach it.
  const twoHanded = items.some((item) => item.kind === "load" && item.socket && item.socket_b);
  const extracted = await extractPoseAngles({
    model: llmModel,
    exerciseName: exercise.display_name,
    description: exercise.description,
    equipment: equipmentSentence(items),
    avatarHeightM: avatar.height_m,
    poses,
    twoHanded,
    grip: exercise.grip,
  });

  const clip: PoseClipJson = {
    kind: "pose-angles",
    fps,
    duration: durationS,
    loop,
    keyframes: keyframesFromPoses(extracted.poses, durationS, loop),
    meta: {
      exercise_id: exercise.id,
      exo_id: exercise.exo_id,
      avatar_code: avatar.code,
      rig: avatar.rig,
      prompt: vector.prompt,
      notes: extracted.notes,
      two_handed: twoHanded,
      grip: exercise.grip,
      generator: WORKER_MODEL,
      llm: extracted.usage.model,
    },
  };

  const uploaded = await uploadStudioFile({
    token,
    bytes: Buffer.from(JSON.stringify(clip)),
    mimeType: "application/json",
    name: `clips/${vector.exercise_id}/${vector.id}.json`,
  });

  return updateVector(token, vector.id, {
    status: "ready",
    error: null,
    file_id: uploaded.id,
    vector_url: uploaded.url,
    format: "json",
    fps,
    frame_count: Math.round(durationS * fps),
    duration_ms: Math.round(durationS * 1000),
    model: `${WORKER_MODEL}/${extracted.usage.model}`,
    usage: extracted.usage,
  });
}

function clampNumber(value: number, lo: number, hi: number): number {
  return Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : lo;
}

function clampInt(value: number, lo: number, hi: number): number {
  return Math.round(clampNumber(value, lo, hi));
}
