/**
 * Styled avatars from the catalog's character reference image: Meshy image-to-3D in a T-pose,
 * then Meshy auto-rigging, the rigged GLB stored in 3d-workspace and registered as a base avatar
 * whose sockets point at whatever the rig called its hands, spine and hips. Server side, staff JWT.
 *
 * Several pollers may run at once (two tabs, the 5 s poll plus a refresh): every step that costs
 * credits or uploads a file is claimed first with a conditional update (see claimAvatarStep), so
 * it happens once.
 */

import { canonicalBoneName, type CanonicalBone } from "./bone-names";
import { socketsForBones } from "./rig-points";
import {
  MESHY_DEFAULTS,
  MeshyError,
  createImageTo3dTask,
  createRiggingTask,
  downloadMeshyFile,
  getImageTo3dTask,
  getRiggingTask,
  imageUrlToDataUri,
  isMeshyConfigured,
} from "./meshy";
import { claimAvatarStep, createAvatar, finishDefaultAvatar, getStyleCharacterFileId, listProcessingAvatars, updateAvatar } from "./queries";
import { deleteStudioFile, studioFileUrl, uploadStudioFile } from "./storage";
import type { AvatarSocket, AvatarSubject, BaseAvatar } from "./types";

export type GenerateAvatarInput = {
  code: string;
  name: string;
  subject: Exclude<AvatarSubject, "neutral">;
  height_m: number;
  is_default: boolean;
  /** A reference image staff chose (data URI); the style's character image when omitted. */
  imageDataUrl?: string | null;
};

/** Progress milestones of a job: image-to-3D fills 0–55, the rigging step is claimed at 58, rigging fills 60–99, storing is claimed at 100. */
const PROGRESS = { modelDone: 55, rigClaim: 58, rigStarted: 60, finishClaim: 100 } as const;
/** A claimed step whose request died: after this long the claim is released so the next poll retries it. */
const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
/** A Meshy job that has not finished after this long is given up. */
const JOB_TIMEOUT_MS = 90 * 60 * 1000;

const MESHY_REQUEST = { ...MESHY_DEFAULTS, pose_mode: "t-pose", origin_at: "bottom" } as const;

/**
 * The character image of the default style for a subject, as a data URI. On a local stack the
 * images metadata is a copy of the cloud's while the files stay there: STUDIO_IMAGE_FALLBACK_STORAGE_URL
 * (the cloud storage base, e.g. https://<sub>.storage.<region>.nhost.run/v1) is tried second.
 */
async function styleCharacterImage(token: string, subject: string): Promise<{ dataUri: string; url: string }> {
  const fileId = await getStyleCharacterFileId(token, subject);
  if (!fileId) throw new MeshyError(`The default style has no ${subject} character image (Images → Styles)`, 400);
  const candidates = [studioFileUrl(fileId)];
  const fallback = process.env.STUDIO_IMAGE_FALLBACK_STORAGE_URL?.replace(/\/$/, "");
  if (fallback) candidates.push(`${fallback}/files/${fileId}`);
  let lastError: unknown = null;
  for (const url of candidates) {
    try {
      return { dataUri: await imageUrlToDataUri(url), url };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new MeshyError("Could not download the character image", 502);
}

/** Start a styled avatar: the row exists at once (processing) and the list route finishes it. */
export async function generateStyledAvatar(token: string, input: GenerateAvatarInput): Promise<BaseAvatar> {
  if (!isMeshyConfigured()) throw new MeshyError("MESHY_API_KEY is not configured on the server", 503);
  const image = input.imageDataUrl ? { dataUri: input.imageDataUrl, url: null } : await styleCharacterImage(token, input.subject);
  const row = await createAvatar(token, {
    code: input.code,
    name: input.name,
    subject: input.subject,
    provider: "meshy",
    status: "pending",
    progress: 0,
    source_image_url: image.url,
    rig: "mixamo",
    height_m: input.height_m,
    sockets: [],
    // make_default is honoured when the avatar is ready: a default must be a ready avatar.
    params: { generated: "meshy", request: MESHY_REQUEST, ...(input.is_default ? { make_default: true } : {}) },
    is_default: false,
  });
  return startMeshyJob(token, row, image.dataUri);
}

async function startMeshyJob(token: string, row: BaseAvatar, imageDataUri: string): Promise<BaseAvatar> {
  try {
    const taskId = await createImageTo3dTask({
      imageUrl: imageDataUri,
      originAt: "bottom",
      poseMode: "t-pose",
      texturePrompt: `${row.subject === "woman" ? "Female" : "Male"} fitness character in sportswear, clean studio materials, no background`,
    });
    return await updateAvatar(token, row.id, { task_id: taskId, rig_task_id: null, status: "processing", progress: 0, error: null });
  } catch (error) {
    return updateAvatar(token, row.id, { status: "error", error: error instanceof Error ? error.message : "Meshy request failed" });
  }
}

/** Run a failed Meshy avatar again from its reference image (the row keeps its code and settings). */
export async function retryStyledAvatar(token: string, avatar: BaseAvatar): Promise<BaseAvatar> {
  if (!isMeshyConfigured()) throw new MeshyError("MESHY_API_KEY is not configured on the server", 503);
  if (avatar.provider !== "meshy") throw new MeshyError("Only a Meshy avatar can be rebuilt", 400);
  if (avatar.status !== "error") throw new MeshyError("Only a failed build can be retried", 409);
  const image = avatar.source_image_url
    ? { dataUri: await imageUrlToDataUri(avatar.source_image_url) }
    : await styleCharacterImage(token, avatar.subject === "woman" ? "woman" : "man");
  const pending = await updateAvatar(token, avatar.id, { status: "pending", progress: 0, error: null, task_id: null, rig_task_id: null });
  return startMeshyJob(token, pending, image.dataUri);
}

// ---------------------------------------------------------------------------
// Reading the rigged GLB: which bone is which
// ---------------------------------------------------------------------------

/** Node names of a binary glTF (the JSON chunk only; no three.js). */
export function glbNodeNames(bytes: Buffer): string[] {
  if (bytes.subarray(0, 4).toString("ascii") !== "glTF") throw new MeshyError("The rigged file is not a binary glTF", 502);
  const chunkLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + chunkLength).toString("utf8")) as { nodes?: { name?: string }[] };
  return (json.nodes ?? []).map((n) => n.name ?? "").filter(Boolean);
}

/** Sockets on the rig's own bone names: hands, upper back, hips. */
export function socketsFromBones(names: string[]): { sockets: AvatarSocket[]; bones: Partial<Record<CanonicalBone, string>> } {
  const bones: Partial<Record<CanonicalBone, string>> = {};
  for (const name of names) {
    const canonical = canonicalBoneName(name);
    if (canonical && !bones[canonical]) bones[canonical] = name;
  }
  // The rule is shared with the rig editor, which offers to put a moved socket back where it was detected.
  return { sockets: socketsForBones(bones), bones };
}

/** Download the rigged GLB, store it, detect the sockets, mark the row ready (default if asked). Caller holds the finish claim. */
async function finishAvatar(token: string, avatar: BaseAvatar, glbUrl: string, usage: Record<string, unknown>): Promise<BaseAvatar> {
  let fileId: string | null = null;
  try {
    const glb = await downloadMeshyFile(glbUrl);
    const names = glbNodeNames(glb.bytes);
    const { sockets, bones } = socketsFromBones(names);
    if (!bones.Hips || !bones.LeftHand || !bones.RightHand) {
      throw new MeshyError(`The rig has no recognisable hips or hands (bones: ${names.slice(0, 10).join(", ")}…)`, 502);
    }
    const file = await uploadStudioFile({ token, bytes: glb.bytes, mimeType: "model/gltf-binary", name: `avatars/${avatar.code.toLowerCase()}.glb` });
    fileId = file.id;
    const { make_default: makeDefault, ...params } = avatar.params ?? {};
    const set = {
      status: "ready" as const,
      progress: 100,
      error: null,
      file_id: file.id,
      model_url: file.url,
      sockets,
      params: { ...params, bones, bone_names: names.length },
      usage,
    };
    return makeDefault === true ? await finishDefaultAvatar(token, avatar.id, set) : await updateAvatar(token, avatar.id, set);
  } catch (error) {
    if (fileId) await deleteStudioFile(token, fileId);
    return updateAvatar(token, avatar.id, { status: "error", error: error instanceof Error ? error.message : "Could not store the avatar", usage });
  }
}

function ageMs(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Date.now() - t : 0;
}

/**
 * Advance every avatar whose Meshy job runs: image-to-3D progress → rigging task → rigged GLB
 * stored, sockets detected, row ready. Steps that cost credits or upload are claimed first; a
 * claim older than CLAIM_TIMEOUT_MS (its request died) is released; a job older than
 * JOB_TIMEOUT_MS is failed. Returns how many rows changed.
 */
export async function syncProcessingAvatars(token: string): Promise<number> {
  if (!isMeshyConfigured()) return 0;
  const rows = await listProcessingAvatars(token);
  let changed = 0;
  for (const row of rows) {
    try {
      if (!row.task_id) {
        // Inserted pending but the task was never created (the request died before startMeshyJob reported).
        if (ageMs(row.inserted_at) > CLAIM_TIMEOUT_MS) {
          await updateAvatar(token, row.id, { status: "error", error: "The Meshy task was never started" });
          changed += 1;
        }
        continue;
      }
      if (ageMs(row.started_at ?? row.inserted_at) > JOB_TIMEOUT_MS) {
        await updateAvatar(token, row.id, { status: "error", error: "Meshy did not finish in time" });
        changed += 1;
        continue;
      }
      const usage = { ...(row.usage ?? {}), provider: "meshy", ai_model: MESHY_DEFAULTS.ai_model } as Record<string, unknown>;

      // A claimed step whose request died: release it so the next poll does it again.
      const claimed = (row.progress === PROGRESS.rigClaim && !row.rig_task_id) || row.progress >= PROGRESS.finishClaim;
      if (claimed) {
        if (ageMs(row.updated_at) > CLAIM_TIMEOUT_MS) {
          await updateAvatar(token, row.id, { progress: row.rig_task_id ? PROGRESS.finishClaim - 1 : PROGRESS.modelDone });
          changed += 1;
        }
        continue; // another request is on it
      }

      if (!row.rig_task_id) {
        const task = await getImageTo3dTask(row.task_id);
        if (task.status === "SUCCEEDED") {
          usage.model_credits = task.consumed_credits ?? null;
          if (!(await claimAvatarStep(token, row.id, { below: PROGRESS.rigClaim, to: PROGRESS.rigClaim, rigTaskNull: true }))) continue;
          try {
            const rigTaskId = await createRiggingTask({ inputTaskId: row.task_id, heightMeters: row.height_m ?? 1.7 });
            await updateAvatar(token, row.id, { rig_task_id: rigTaskId, progress: PROGRESS.rigStarted, usage });
          } catch (error) {
            // Release the claim; a transient Meshy error is retried on the next poll, a definitive one fails the row.
            if (error instanceof MeshyError && error.upstreamStatus !== null && error.upstreamStatus < 500 && error.upstreamStatus !== 429) {
              await updateAvatar(token, row.id, { status: "error", error: error.message, usage });
            } else {
              await updateAvatar(token, row.id, { progress: PROGRESS.modelDone });
            }
          }
          changed += 1;
        } else if (task.status === "FAILED" || task.status === "CANCELED") {
          await updateAvatar(token, row.id, { status: "error", error: task.task_error?.message || `Meshy task ${task.status.toLowerCase()}`, usage });
          changed += 1;
        } else {
          const progress = Math.min(PROGRESS.modelDone, Math.round((task.progress ?? 0) * 0.55));
          if (progress !== row.progress) {
            await updateAvatar(token, row.id, { progress });
            changed += 1;
          }
        }
        continue;
      }

      const rig = await getRiggingTask(row.rig_task_id);
      if (rig.status === "SUCCEEDED") {
        const url = rig.result?.rigged_character_glb_url;
        usage.rig_credits = rig.consumed_credits ?? null;
        if (!url) {
          await updateAvatar(token, row.id, { status: "error", error: "Meshy rigging finished without a GLB", usage });
        } else if (await claimAvatarStep(token, row.id, { below: PROGRESS.finishClaim, to: PROGRESS.finishClaim, rigTaskNull: false })) {
          await finishAvatar(token, row, url, usage);
        }
        changed += 1;
      } else if (rig.status === "FAILED" || rig.status === "CANCELED") {
        await updateAvatar(token, row.id, { status: "error", error: rig.task_error?.message || `Meshy rigging ${rig.status.toLowerCase()}`, usage });
        changed += 1;
      } else {
        const progress = Math.min(PROGRESS.finishClaim - 1, PROGRESS.rigStarted + Math.round((rig.progress ?? 0) * 0.39));
        if (progress !== row.progress) {
          await updateAvatar(token, row.id, { progress });
          changed += 1;
        }
      }
    } catch (error) {
      if (error instanceof MeshyError && error.upstreamStatus === 404) {
        await updateAvatar(token, row.id, { status: "error", error: "Meshy task not found" });
        changed += 1;
      }
      // Transient errors: try again on the next poll.
    }
  }
  return changed;
}
