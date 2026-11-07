/**
 * Styled avatars from the catalog's character reference image: Meshy image-to-3D in a T-pose,
 * then Meshy auto-rigging, the rigged GLB stored in 3d-workspace and registered as a base avatar
 * whose sockets point at whatever the rig called its hands, spine and hips. Server side, staff JWT.
 */

import { canonicalBoneName, type CanonicalBone } from "./bone-names";
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
import { createAvatar, getStyleCharacterFileId, listProcessingAvatars, updateAvatar } from "./queries";
import { deleteStudioFile, uploadStudioFile } from "./storage";
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

function storageFileUrl(fileId: string): string {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  return `https://${subdomain}.storage.${region}.nhost.run/v1/files/${fileId}`;
}

/**
 * The character image of the default style for a subject, as a data URI. On a local stack the
 * images metadata is a copy of the cloud's while the files stay there: STUDIO_IMAGE_FALLBACK_STORAGE_URL
 * (the cloud storage base, e.g. https://<sub>.storage.<region>.nhost.run/v1) is tried second.
 */
async function styleCharacterImage(token: string, subject: string): Promise<{ dataUri: string; url: string }> {
  const fileId = await getStyleCharacterFileId(token, subject);
  if (!fileId) throw new MeshyError(`The default style has no ${subject} character image (Images → Styles)`, 400);
  const candidates = [storageFileUrl(fileId)];
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
    source_image_url: image.url,
    rig: "mixamo",
    height_m: input.height_m,
    sockets: [],
    params: { generated: "meshy", request: { ...MESHY_DEFAULTS, pose_mode: "t-pose", origin_at: "bottom" } },
    is_default: false, // set when ready: a default must be a ready avatar
    ...(input.is_default ? { params: { generated: "meshy", make_default: true, request: { ...MESHY_DEFAULTS, pose_mode: "t-pose", origin_at: "bottom" } } } : {}),
  });
  try {
    const taskId = await createImageTo3dTask({
      imageUrl: image.dataUri,
      originAt: "bottom",
      poseMode: "t-pose",
      texturePrompt: `${input.subject === "woman" ? "Female" : "Male"} fitness character in sportswear, clean studio materials, no background`,
    });
    return await updateAvatar(token, row.id, { task_id: taskId, status: "processing", progress: 0 });
  } catch (error) {
    return updateAvatar(token, row.id, { status: "error", error: error instanceof Error ? error.message : "Meshy request failed" });
  }
}

// ---------------------------------------------------------------------------
// Reading the rigged GLB: which bone is which
// ---------------------------------------------------------------------------

/** Node names of a binary glTF (the JSON chunk only; no three.js). */
function glbNodeNames(bytes: Buffer): string[] {
  if (bytes.subarray(0, 4).toString("ascii") !== "glTF") throw new MeshyError("The rigged file is not a binary glTF", 502);
  const chunkLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + chunkLength).toString("utf8")) as { nodes?: { name?: string }[] };
  return (json.nodes ?? []).map((n) => n.name ?? "").filter(Boolean);
}

/** Sockets on the rig's own bone names: hands, upper back, hips. */
function socketsFromBones(names: string[]): { sockets: AvatarSocket[]; bones: Partial<Record<CanonicalBone, string>> } {
  const bones: Partial<Record<CanonicalBone, string>> = {};
  for (const name of names) {
    const canonical = canonicalBoneName(name);
    if (canonical && !bones[canonical]) bones[canonical] = name;
  }
  const sockets: AvatarSocket[] = [];
  if (bones.LeftHand) sockets.push({ id: "hand_l", bone: bones.LeftHand, offset: [0.05, 0, 0] });
  if (bones.RightHand) sockets.push({ id: "hand_r", bone: bones.RightHand, offset: [-0.05, 0, 0] });
  if (bones.Spine2 ?? bones.Spine1) sockets.push({ id: "back", bone: (bones.Spine2 ?? bones.Spine1)!, offset: [0, 0, -0.16] });
  if (bones.Hips) sockets.push({ id: "feet", bone: bones.Hips, offset: [0, -0.95, 0] });
  return { sockets, bones };
}

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
    const makeDefault = avatar.params?.make_default === true;
    const updated = await updateAvatar(token, avatar.id, {
      status: "ready",
      progress: 100,
      error: null,
      file_id: file.id,
      model_url: file.url,
      sockets,
      params: { ...avatar.params, bones, bone_names: names.length, make_default: undefined },
      usage,
    });
    if (makeDefault) {
      // One default at a time: clear the current one, then set this avatar.
      const { staffGql } = await import("@/lib/staff-gql");
      await staffGql(token, `mutation { update_animation_studio_base_avatars(where: { is_default: { _eq: true } }, _set: { is_default: false }) { affected_rows } }`);
      return updateAvatar(token, avatar.id, { is_default: true });
    }
    return updated;
  } catch (error) {
    if (fileId) await deleteStudioFile(token, fileId);
    return updateAvatar(token, avatar.id, { status: "error", error: error instanceof Error ? error.message : "Could not store the avatar", usage });
  }
}

/**
 * Advance every avatar whose Meshy job runs: image-to-3D progress → rigging task → rigged GLB
 * stored, sockets detected, row ready. Several callers are safe: finishing is guarded by the
 * progress flip (99 → 100 happens inside finishAvatar's update only once a file exists).
 */
export async function syncProcessingAvatars(token: string): Promise<number> {
  if (!isMeshyConfigured()) return 0;
  const rows = await listProcessingAvatars(token);
  let changed = 0;
  for (const row of rows) {
    try {
      if (!row.task_id) continue;
      const usage = { ...(row.usage ?? {}), provider: "meshy", ai_model: MESHY_DEFAULTS.ai_model } as Record<string, unknown>;
      if (!row.rig_task_id) {
        const task = await getImageTo3dTask(row.task_id);
        if (task.status === "SUCCEEDED") {
          usage.model_credits = task.consumed_credits ?? null;
          const rigTaskId = await createRiggingTask({ inputTaskId: row.task_id, heightMeters: row.height_m ?? 1.7 });
          await updateAvatar(token, row.id, { rig_task_id: rigTaskId, progress: 60, usage });
          changed += 1;
        } else if (task.status === "FAILED" || task.status === "CANCELED") {
          await updateAvatar(token, row.id, { status: "error", error: task.task_error?.message || `Meshy task ${task.status.toLowerCase()}`, usage });
          changed += 1;
        } else {
          const progress = Math.min(55, Math.round((task.progress ?? 0) * 0.55));
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
        if (!url) await updateAvatar(token, row.id, { status: "error", error: "Meshy rigging finished without a GLB", usage });
        else await finishAvatar(token, row, url, usage);
        changed += 1;
      } else if (rig.status === "FAILED" || rig.status === "CANCELED") {
        await updateAvatar(token, row.id, { status: "error", error: rig.task_error?.message || `Meshy rigging ${rig.status.toLowerCase()}`, usage });
        changed += 1;
      } else {
        const progress = Math.min(99, 60 + Math.round((rig.progress ?? 0) * 0.39));
        if (progress !== row.progress) {
          await updateAvatar(token, row.id, { progress });
          changed += 1;
        }
      }
    } catch (error) {
      if (error instanceof MeshyError && error.status === 404) {
        await updateAvatar(token, row.id, { status: "error", error: "Meshy task not found" });
        changed += 1;
      }
      // Transient errors: try again on the next poll.
    }
  }
  return changed;
}
