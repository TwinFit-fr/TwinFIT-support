/**
 * Equipment model lifecycle on the server: start a Meshy task from the reference image, bring
 * running tasks up to date (download the GLB into 3d-workspace when they finish), register an
 * uploaded model. Called by the /api/studio/equipment routes with the staff JWT.
 */

import { defaultSizeM, defaultTexturePrompt } from "./equipment";
import {
  MESHY_DEFAULTS,
  MeshyError,
  createImageTo3dTask,
  downloadMeshyFile,
  getImageTo3dTask,
  getMeshyBalance,
  imageUrlToDataUri,
  isMeshyConfigured,
} from "./meshy";
import {
  claimEquipmentFinish,
  createEquipmentModel,
  listEquipment,
  listProcessingEquipmentModels,
  updateEquipmentModel,
} from "./queries";
import { deleteStudioFile, uploadStudioFile } from "./storage";
import type { EquipmentKind, EquipmentModel, MeshyCredits, StudioEquipment } from "./types";

export type GenerateEquipmentInput = {
  kind: EquipmentKind;
  code: string;
  /** Texture hint; the catalog description when omitted. */
  prompt?: string | null;
  /** A reference image staff chose (data URI); the style reference image when omitted. */
  imageDataUrl?: string | null;
};

function findEntry(list: StudioEquipment[], kind: EquipmentKind, code: string): StudioEquipment {
  const entry = list.find((e) => e.kind === kind && e.code === code);
  if (!entry) throw new MeshyError(`Unknown ${kind} code ${code}`, 404);
  return entry;
}

function modelPath(model: Pick<EquipmentModel, "kind" | "code" | "id">, ext: string): string {
  return `equipment/${model.kind}/${model.code.toLowerCase()}/${model.id}.${ext}`;
}

/** Enqueue one generation: a row in processing with the Meshy task id, or in error when Meshy refused. */
export async function generateEquipmentModel(token: string, input: GenerateEquipmentInput): Promise<EquipmentModel> {
  if (!isMeshyConfigured()) throw new MeshyError("MESHY_API_KEY is not configured on the server", 503);
  const entry = findEntry(await listEquipment(token), input.kind, input.code);
  const sourceUrl = input.imageDataUrl ? null : entry.reference_image_url;
  if (!input.imageDataUrl && !sourceUrl) {
    throw new MeshyError(`${entry.name} has no reference image in the default style; paste one`, 400);
  }
  const prompt = (input.prompt?.trim() || entry.description?.trim() || defaultTexturePrompt(input.kind, entry.name)).slice(0, 800);

  const row = await createEquipmentModel(token, {
    kind: input.kind,
    code: input.code,
    name: entry.name,
    provider: "meshy",
    source_image_url: sourceUrl,
    prompt,
    status: "pending",
    params: { size_m: defaultSizeM(input.kind, input.code), request: { ...MESHY_DEFAULTS, origin_at: input.kind === "support" ? "bottom" : "center" } },
  });

  try {
    const imageUrl = await imageUrlToDataUri(input.imageDataUrl ?? sourceUrl!);
    const taskId = await createImageTo3dTask({
      imageUrl,
      texturePrompt: prompt,
      originAt: input.kind === "support" ? "bottom" : "center",
    });
    return await updateEquipmentModel(token, row.id, { task_id: taskId, status: "processing", progress: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meshy request failed";
    return updateEquipmentModel(token, row.id, { status: "error", error: message });
  }
}

/** Finish one task whose Meshy status is SUCCEEDED: GLB and thumbnail into the bucket, row ready. */
async function finishEquipmentModel(token: string, model: EquipmentModel, glbUrl: string, thumbnailUrl: string | undefined, usage: Record<string, unknown>) {
  const uploaded: string[] = [];
  try {
    const glb = await downloadMeshyFile(glbUrl);
    if (glb.bytes.subarray(0, 4).toString("ascii") !== "glTF") throw new MeshyError("Meshy returned a file that is not a binary glTF", 502);
    const file = await uploadStudioFile({ token, bytes: glb.bytes, mimeType: "model/gltf-binary", name: modelPath(model, "glb") });
    uploaded.push(file.id);

    let thumb: { id: string; url: string } | null = null;
    if (thumbnailUrl) {
      try {
        const png = await downloadMeshyFile(thumbnailUrl);
        thumb = await uploadStudioFile({ token, bytes: png.bytes, mimeType: png.contentType?.split(";")[0] || "image/png", name: modelPath(model, "png") });
        uploaded.push(thumb.id);
      } catch {
        thumb = null; // a missing preview is cosmetic
      }
    }
    return await updateEquipmentModel(token, model.id, {
      status: "ready",
      progress: 100,
      error: null,
      file_id: file.id,
      model_url: file.url,
      thumbnail_file_id: thumb?.id ?? null,
      thumbnail_url: thumb?.url ?? null,
      usage,
    });
  } catch (error) {
    await Promise.all(uploaded.map((id) => deleteStudioFile(token, id)));
    const message = error instanceof Error ? error.message : "Could not store the result";
    return updateEquipmentModel(token, model.id, { status: "error", error: message, usage });
  }
}

/**
 * Poll every processing row's task and update it: progress while it runs, ready (file stored) or
 * error when it ended. Safe to call from several tabs at once (see claimEquipmentFinish).
 */
export async function syncProcessingEquipment(token: string): Promise<number> {
  if (!isMeshyConfigured()) return 0;
  const rows = await listProcessingEquipmentModels(token);
  let changed = 0;
  for (const row of rows) {
    if (!row.task_id || row.progress >= 100) continue; // 100 = another request is storing the result
    let task;
    try {
      task = await getImageTo3dTask(row.task_id);
    } catch (error) {
      if (error instanceof MeshyError && error.status === 404) {
        await updateEquipmentModel(token, row.id, { status: "error", error: "Meshy task not found" });
        changed += 1;
      }
      continue; // transient: try again on the next poll
    }
    const usage = { consumed_credits: task.consumed_credits ?? null, provider: "meshy", ai_model: MESHY_DEFAULTS.ai_model };
    if (task.status === "SUCCEEDED") {
      if (!task.model_urls?.glb) {
        await updateEquipmentModel(token, row.id, { status: "error", error: "Meshy finished without a GLB", usage });
      } else if (await claimEquipmentFinish(token, row.id)) {
        await finishEquipmentModel(token, row, task.model_urls.glb, task.thumbnail_url, usage);
      }
      changed += 1;
    } else if (task.status === "FAILED" || task.status === "CANCELED") {
      await updateEquipmentModel(token, row.id, {
        status: "error",
        error: task.task_error?.message || `Meshy task ${task.status.toLowerCase()}`,
        usage,
      });
      changed += 1;
    } else {
      const progress = Math.min(99, Math.max(0, Math.round(task.progress ?? 0)));
      if (progress !== row.progress) {
        await updateEquipmentModel(token, row.id, { progress });
        changed += 1;
      }
    }
  }
  return changed;
}

/** Register a .glb staff uploaded for a code: the row is ready at once. */
export async function storeUploadedEquipmentModel(
  token: string,
  input: { kind: EquipmentKind; code: string; bytes: Buffer; ext: "glb" | "gltf" },
): Promise<EquipmentModel> {
  const entry = findEntry(await listEquipment(token), input.kind, input.code);
  const row = await createEquipmentModel(token, {
    kind: input.kind,
    code: input.code,
    name: entry.name,
    provider: "upload",
    status: "pending",
    params: { size_m: defaultSizeM(input.kind, input.code) },
  });
  const file = await uploadStudioFile({
    token,
    bytes: input.bytes,
    mimeType: input.ext === "glb" ? "model/gltf-binary" : "model/gltf+json",
    name: modelPath(row, input.ext),
  });
  try {
    return await updateEquipmentModel(token, row.id, { status: "ready", file_id: file.id, model_url: file.url });
  } catch (error) {
    await deleteStudioFile(token, file.id);
    throw error;
  }
}

/** Credits left, or null when the key is missing or Meshy is unreachable (the list still renders). */
export async function meshyCreditsOrNull(): Promise<MeshyCredits | null> {
  if (!isMeshyConfigured()) return null;
  try {
    return await getMeshyBalance();
  } catch {
    return null;
  }
}
