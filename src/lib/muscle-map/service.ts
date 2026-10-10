import { editImage, generateImage } from "@/lib/images/openai";
import { deleteImageFile, downloadImageFile, uploadImageFile } from "@/lib/images/storage";
import { buildMask, rectOf, type AdjustParams } from "./mask-ops";
import { baseFileName, maskFileName, sourceFileName } from "./paths";
import { mapLimit } from "./pool";
import { basePrompt, generationParams, maskPrompt } from "./prompt";
import {
  deleteBaseRow,
  deleteMaskRow,
  getActiveBase,
  getMapMuscle,
  getSettings,
  insertActiveBase,
  insertActiveMask,
  listMasksOfBase,
  updateMaskFile,
} from "./queries";
import { decodeRgba, encodeMaskPng, imageSize } from "./raster";
import type { MapBase, MapMask, MapView, MaskParams } from "./types";

/** Server flows of the muscle map prototype: model calls, Storage files and rows together. */

type Image = { bytes: Buffer; mimeType: string };

/** Generates (with the settings' base prompt) or takes an uploaded base; it becomes active. */
export async function createBase(
  token: string,
  view: MapView,
  upload: Image | null,
): Promise<MapBase> {
  let image: Image;
  let made: Pick<MapBase, "model" | "prompt" | "params"> & { usage: Record<string, unknown> | null };
  if (upload) {
    image = upload;
    made = { model: "", prompt: "", params: {}, usage: null };
  } else {
    const settings = await getSettings(token);
    const params = generationParams(settings);
    const prompt = basePrompt(settings, view);
    const result = await generateImage(prompt, params);
    image = result;
    made = { model: params.model, prompt, params: { generation: params }, usage: result.usage };
  }
  const size = await imageSize(image.bytes);
  const file = await uploadImageFile({
    token,
    bytes: image.bytes,
    mimeType: image.mimeType,
    name: baseFileName(view, image.mimeType),
  });
  try {
    return await insertActiveBase(token, {
      view,
      file_id: file.id,
      image_url: file.url,
      ...size,
      ...made,
    });
  } catch (error) {
    await deleteImageFile(token, file.id).catch(() => undefined);
    throw error;
  }
}

/** Builds a mask PNG of the base's size from a source image; returns it with its rect. */
async function extractMask(
  token: string,
  base: MapBase,
  source: Buffer,
  keyColor: string,
  adjust: AdjustParams,
) {
  const size = { width: base.width, height: base.height };
  const baseFile = await downloadImageFile(token, base.file_id);
  const [sourceRaster, baseRaster] = await Promise.all([
    decodeRgba(source, size),
    decodeRgba(baseFile.bytes, size),
  ]);
  const alpha = buildMask(sourceRaster, baseRaster, keyColor, adjust);
  return {
    png: await encodeMaskPng(alpha, base.width, base.height),
    rect: rectOf(alpha, base.width, base.height),
  };
}

/**
 * A new mask for a muscle on the active base of its view; it becomes active. Generated: the
 * model paints the muscle in the key color on the base, and the mask is extracted from that
 * output (kept as the source to re-adjust later). Uploaded: the image's alpha is the mask.
 */
export async function createMask(
  token: string,
  input: { muscleId: string; adjust: AdjustParams; upload: Image | null },
): Promise<MapMask> {
  const [settings, muscle] = await Promise.all([
    getSettings(token),
    getMapMuscle(token, input.muscleId),
  ]);
  if (!muscle) throw new Error("This muscle has no map view; add it to the map first");
  const base = await getActiveBase(token, muscle.view);
  if (!base) throw new Error(`No active ${muscle.view} base yet`);

  let source: Image;
  let made: Pick<MapMask, "model" | "prompt"> & {
    usage: Record<string, unknown> | null;
    generation?: MaskParams["generation"];
  };
  if (input.upload) {
    source = input.upload;
    made = { model: "", prompt: "", usage: null };
  } else {
    const params = generationParams(settings);
    const prompt = maskPrompt(settings, muscle);
    const baseFile = await downloadImageFile(token, base.file_id);
    const result = await editImage(
      prompt,
      params,
      [{ bytes: baseFile.bytes, mimeType: baseFile.contentType }],
      { useFidelity: true, moderation: true },
    );
    source = result;
    made = { model: params.model, prompt, usage: result.usage, generation: params };
  }

  const code = muscle.muscle.code;
  const sourceFile = await uploadImageFile({
    token,
    bytes: source.bytes,
    mimeType: source.mimeType,
    name: sourceFileName(muscle.view, code, source.mimeType),
  });
  const uploaded: string[] = [sourceFile.id];
  try {
    const mask = await extractMask(token, base, source.bytes, settings.key_color, input.adjust);
    const maskFile = await uploadImageFile({
      token,
      bytes: mask.png,
      mimeType: "image/png",
      name: maskFileName(muscle.view, code),
    });
    uploaded.push(maskFile.id);
    return await insertActiveMask(token, {
      base_id: base.id,
      muscle_id: muscle.muscle_id,
      file_id: maskFile.id,
      source_file_id: sourceFile.id,
      image_url: maskFile.url,
      rect: mask.rect,
      method: input.upload ? "uploaded" : "generated",
      model: made.model,
      prompt: made.prompt,
      params: {
        ...(made.generation ? { generation: made.generation } : {}),
        adjust: input.adjust,
      },
      usage: made.usage,
    });
  } catch (error) {
    await Promise.all(uploaded.map((id) => deleteImageFile(token, id).catch(() => undefined)));
    throw error;
  }
}

/**
 * Re-extracts a mask from its source with new settings (no new generation). The row points to
 * the new file before the old one is deleted: deleting a mask's file deletes its row.
 */
export async function readjustMask(
  token: string,
  mask: MapMask,
  base: MapBase,
  adjust: AdjustParams,
): Promise<MapMask> {
  if (!mask.source_file_id) throw new Error("This mask has no source image to adjust");
  const [settings, source, muscle] = await Promise.all([
    getSettings(token),
    downloadImageFile(token, mask.source_file_id),
    getMapMuscle(token, mask.muscle_id),
  ]);
  const extracted = await extractMask(token, base, source.bytes, settings.key_color, adjust);
  const file = await uploadImageFile({
    token,
    bytes: extracted.png,
    mimeType: "image/png",
    name: maskFileName(mask.view, muscle?.muscle.code ?? mask.muscle_id),
  });
  let updated: MapMask;
  try {
    updated = await updateMaskFile(token, mask.id, {
      file_id: file.id,
      image_url: file.url,
      rect: extracted.rect,
      params: { ...mask.params, adjust },
    });
  } catch (error) {
    await deleteImageFile(token, file.id).catch(() => undefined);
    throw error;
  }
  await deleteImageFile(token, mask.file_id);
  return updated;
}

async function copyFile(token: string, fileId: string, name: (mimeType: string) => string) {
  const file = await downloadImageFile(token, fileId);
  return uploadImageFile({
    token,
    bytes: file.bytes,
    mimeType: file.contentType,
    name: name(file.contentType),
  });
}

/**
 * Copies every active mask of `from` onto `to` (same view and size): new files, rows with
 * `method = copied` and `params.copied_from`. Each copy becomes the active mask of its muscle.
 */
export async function copyMasks(token: string, from: MapBase, to: MapBase) {
  if (from.id === to.id) throw new Error("Pick another base to copy from");
  if (from.view !== to.view) throw new Error("Masks can only be copied between bases of one view");
  if (from.width !== to.width || from.height !== to.height) {
    throw new Error(
      `Sizes differ (${from.width}×${from.height} vs ${to.width}×${to.height}); masks would not fit`,
    );
  }
  const masks = await listMasksOfBase(token, from.id, true);
  const results = await mapLimit(masks, 4, async (mask) => {
    const muscle = await getMapMuscle(token, mask.muscle_id);
    const code = muscle?.muscle.code ?? mask.muscle_id;
    const file = await copyFile(token, mask.file_id, () => maskFileName(mask.view, code));
    const source = mask.source_file_id
      ? await copyFile(token, mask.source_file_id, (mime) => sourceFileName(mask.view, code, mime))
      : null;
    try {
      return await insertActiveMask(token, {
        base_id: to.id,
        muscle_id: mask.muscle_id,
        file_id: file.id,
        source_file_id: source?.id ?? null,
        image_url: file.url,
        rect: mask.rect,
        method: "copied",
        model: mask.model,
        prompt: mask.prompt,
        params: { ...mask.params, copied_from: mask.id },
        usage: null,
      });
    } catch (error) {
      await Promise.all(
        [file.id, source?.id]
          .filter((id): id is string => Boolean(id))
          .map((id) => deleteImageFile(token, id).catch(() => undefined)),
      );
      throw error;
    }
  });
  const failed = results.filter((r) => !r.ok).length;
  return { copied: results.length - failed, failed };
}

/** Deletes an inactive base, its masks (cascade) and then all their files. */
export async function deleteBase(token: string, base: MapBase) {
  if (base.active) throw new Error("Deactivate the base before deleting it");
  const masks = await listMasksOfBase(token, base.id);
  await deleteBaseRow(token, base.id);
  const files = [
    base.file_id,
    ...masks.flatMap((m) => [m.file_id, m.source_file_id ?? ""]).filter(Boolean),
  ];
  await mapLimit(files, 4, (id) => deleteImageFile(token, id));
}

/** Deletes an inactive mask row and then its files. */
export async function deleteMask(token: string, mask: MapMask) {
  if (mask.active) throw new Error("Deactivate the mask before deleting it");
  await deleteMaskRow(token, mask.id);
  const files = [mask.file_id, mask.source_file_id].filter((id): id is string => Boolean(id));
  await mapLimit(files, 2, (id) => deleteImageFile(token, id));
}
