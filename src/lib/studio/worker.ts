/**
 * The movement pipeline, pose-based: claim a pending vector, read the three catalog poses of its
 * exercise, have the LLM write them as anatomical angles, store the keyframes as a `json` clip in
 * 3d-workspace and mark the row ready. No video, no motion-capture provider: the viewer solves the
 * angles on the avatar's rig. Server side, with the staff JWT; a tick processes one row.
 */

import { POSE_CLIP_VERSION, buildKeyframes, type LoopMode, type PoseClipJson } from "./anatomy";
import { DEFAULT_PARAMS, buildTemplate, templateFor, type BuiltTemplate, type TemplateExercise, type TemplateParams } from "./exercise-templates";
import { imageUrlToDataUri } from "./meshy";
import { chooseTemplateParams, draftPoses, type PoseDraftResult } from "./pose-llm";
import { normalizePoseText } from "./pose-text";
import { equipmentSentence } from "./prompt";
import { validateOnStandIn, type DraftCheck } from "./validate-server";
import {
  claimMovementVector,
  getAvatar,
  getExerciseFrames,
  getExercisePoses,
  getWorkerExercise,
  updateVector,
} from "./queries";
import { uploadStudioFile } from "./storage";
import type { EquipmentItem, MovementVector } from "./types";

const RETRY_DELAY_MS = 30_000;
const WORKER_MODEL = "studio-poses";

/**
 * Everything the pose model needs about an exercise: its name and description, the three pose
 * texts, the catalog frames as data URIs (start, mid, end; skipped when a download fails), grip.
 */
export async function gatherExerciseContext(token: string, exerciseId: string, subject: string) {
  const exercise = await getWorkerExercise(token, exerciseId);
  if (!exercise) throw new Error("The exercise no longer exists");
  const [rawPoses, frames] = await Promise.all([getExercisePoses(token, exercise.exo_id), getExerciseFrames(token, exercise.exo_id, subject === "woman" ? "woman" : "man")]);
  const poses = rawPoses.map((p) => ({ ...p, pose: normalizePoseText(p.pose).text }));
  const images: string[] = [];
  for (const frame of frames.slice(0, 3)) {
    try {
      images.push(await imageUrlToDataUri(frame.image_url));
    } catch {
      // A frame that cannot be fetched is left out; the text still describes it.
    }
  }
  return { exercise, poses, images };
}

export type DraftRequest = {
  exerciseId: string;
  subject: string;
  avatarHeightM: number | null;
  items: EquipmentItem[];
  twoHanded: boolean;
  instructions?: string | null;
  poseCount?: number | null;
  model?: string | null;
};

export type ExerciseDraft = PoseDraftResult & {
  exoId: number;
  grip: string | null;
  /** The template the poses come from; null when the model wrote raw angles. */
  template: string | null;
  params: TemplateParams | null;
  conflicts: string[];
  unilateral: boolean;
  airborne: boolean;
  moving: boolean;
  check: DraftCheck | null;
};

const templateClip = (t: BuiltTemplate): PoseClipJson => ({
  kind: "pose-angles",
  version: POSE_CLIP_VERSION,
  fps: 30,
  duration: 4,
  loop: true,
  keyframes: buildKeyframes(t.poses, 4, t.mode, t.weights),
  meta: { unilateral: t.unilateral, airborne: t.airborne, moving: t.moving },
});

/**
 * The key poses of an exercise, for the editor's "AI draft" and the worker. With a template the
 * model only reads its parameters, and whatever it picks is checked as a body: a choice that does
 * not hold up falls back to the template's defaults. Without one it writes raw angles.
 */
export async function draftExercisePoses(token: string, req: DraftRequest): Promise<ExerciseDraft> {
  const { exercise, poses, images } = await gatherExerciseContext(token, req.exerciseId, req.subject);
  const catalog: TemplateExercise = { name: exercise.display_name, movement: exercise.movement, position: exercise.position, equipment: exercise.equipment, support: exercise.support, grip: exercise.grip };
  const templated = exercise.movement !== null && (templateFor(catalog) !== "resting" || exercise.display_name === "Resting");
  if (!templated) {
    if (poses.length !== 3) throw new Error(`Exercise #${exercise.exo_id} has ${poses.length} poses instead of 3 (images.exercise_poses)`);
    const result = await draftPoses({
      model: req.model,
      exerciseName: exercise.display_name,
      description: exercise.description,
      equipment: equipmentSentence(req.items),
      avatarHeightM: req.avatarHeightM,
      poses,
      twoHanded: req.twoHanded,
      grip: exercise.grip,
      images,
      instructions: req.instructions,
      poseCount: req.poseCount,
    });
    return { ...result, exoId: exercise.exo_id, grip: exercise.grip, template: null, params: null, conflicts: [], unilateral: false, airborne: false, moving: false, check: null };
  }

  const choice = await chooseTemplateParams({
    model: req.model,
    exerciseName: exercise.display_name,
    description: exercise.description,
    equipment: equipmentSentence(req.items),
    poses,
    images,
    instructions: req.instructions,
  });
  let params = choice.params;
  let built = buildTemplate(catalog, params);
  let check = validateOnStandIn(templateClip(built), req.avatarHeightM);
  let fellBack = false;
  if (!check.ok) {
    params = DEFAULT_PARAMS;
    built = buildTemplate(catalog, params);
    check = validateOnStandIn(templateClip(built), req.avatarHeightM);
    fellBack = true;
  }
  return {
    poses: built.poses,
    labels: built.labels,
    weights: built.weights,
    mode: built.mode,
    notes: [fellBack ? "The chosen parameters did not hold up as a body: template defaults used." : null, ...choice.conflicts].filter(Boolean).join(" "),
    usage: choice.usage,
    raw: choice.raw,
    clamped: [],
    exoId: exercise.exo_id,
    grip: exercise.grip,
    template: built.id,
    params,
    conflicts: choice.conflicts,
    unilateral: built.unilateral,
    airborne: built.airborne,
    moving: built.moving,
    check,
  };
}

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
  const avatar = await getAvatar(token, vector.avatar_id);
  if (!avatar) throw new Error("The avatar no longer exists");

  const fps = clampInt(Number(vector.params.fps ?? 30), 1, 120);
  const durationS = clampNumber(Number(vector.params.duration_s ?? 4), 0.5, 60);
  const loop = vector.params.loop !== false;
  const llmModel = typeof vector.params.model === "string" ? vector.params.model : null;
  const items = vector.equipment.items ?? [];
  // A load held in both hands (socket + socket_b): the implement leads and the arms reach it.
  const twoHanded = items.some((item) => item.kind === "load" && item.socket && item.socket_b);

  const draft = await draftExercisePoses(token, {
    exerciseId: vector.exercise_id,
    subject: avatar.subject,
    avatarHeightM: avatar.height_m,
    items,
    twoHanded,
    instructions: typeof vector.params.instructions === "string" ? vector.params.instructions : vector.prompt,
    poseCount: typeof vector.params.pose_count === "number" ? vector.params.pose_count : null,
    model: llmModel,
  });
  const loopMode: LoopMode = !loop ? "once" : vector.params.loop_mode === "cycle" ? "cycle" : vector.params.loop_mode === "pingpong" ? "pingpong" : draft.mode;

  const clip: PoseClipJson = {
    kind: "pose-angles",
    version: POSE_CLIP_VERSION,
    fps,
    duration: durationS,
    loop,
    keyframes: buildKeyframes(draft.poses, durationS, loopMode, draft.weights),
    meta: {
      loop_mode: loopMode,
      segment_weights: draft.weights,
      labels: draft.labels,
      exercise_id: vector.exercise_id,
      exo_id: draft.exoId,
      avatar_code: avatar.code,
      rig: avatar.rig,
      prompt: vector.prompt,
      notes: draft.notes,
      // A template moves the hands by angles and the bar follows them; raw angles reach for the implement.
      two_handed: draft.template ? false : twoHanded,
      grip: draft.grip,
      generator: WORKER_MODEL,
      llm: draft.usage.model,
      template: draft.template,
      template_params: draft.params,
      text_conflicts: draft.conflicts,
      unilateral: draft.unilateral,
      airborne: draft.airborne,
      moving: draft.moving,
      raw_model_output: draft.raw,
      clamped: draft.clamped,
    },
  };
  // Nothing goes out that does not hold up as a body: the row retries or fails with the reason.
  const check = validateOnStandIn(clip, avatar.height_m);
  clip.meta!.validation = check;
  if (!check.ok) throw new Error(`The clip fails validation: ${check.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`);

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
    model: `${WORKER_MODEL}/${draft.usage.model}`,
    usage: draft.usage,
  });
}

function clampNumber(value: number, lo: number, hi: number): number {
  return Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : lo;
}

function clampInt(value: number, lo: number, hi: number): number {
  return Math.round(clampNumber(value, lo, hi));
}
