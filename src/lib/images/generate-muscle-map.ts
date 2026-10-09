import {
  clearActiveMuscleMap,
  getMuscleMapTarget,
  insertMuscleMapImage,
} from "@/lib/images/muscle-maps";
import { editImage } from "@/lib/images/openai";
import { fillMuscleMapTemplate } from "@/lib/images/prompt";
import { getStyle, getUserIdFromToken, listImagePromptsForStyle } from "@/lib/images/queries";
import {
  libraryReferenceDirective,
  muscleBaseDirective,
  muscleMapFileName,
} from "@/lib/images/reference";
import { loadReferenceInputs, resolveRunReferences } from "@/lib/images/references";
import { downloadImageFile, uploadImageFile } from "@/lib/images/storage";
import { extensionForMime } from "@/lib/images/style-assets";
import type { MuscleMapImage, MuscleMapSlot, MuscleMapTargetRef } from "./types";
import { muscleMapSlotLabel } from "./types";
import { GenerationError } from "./generation-error";
import { currentPromptVersions } from "./prompt-versions";

/** One muscle map to generate: it edits the style's base of its view and crop. */
export type MuscleMapRequest = {
  styleId: string;
  target: MuscleMapTargetRef;
  slot: MuscleMapSlot;
  promptOverride?: string;
  /** Library references for this run; omitted = the ones linked to the target. */
  referenceIds?: string[];
  /** Keep it as an inactive candidate; the active map stays. */
  candidate?: boolean;
};

/**
 * Generates one map and stores it as the active map of its target, view and crop (the previous
 * one stays in history). Throws GenerationError when the request cannot succeed as asked.
 */
export async function generateMuscleMap(
  token: string,
  { styleId, target: ref, slot, promptOverride, referenceIds, candidate }: MuscleMapRequest,
): Promise<MuscleMapImage> {
  const [style, target] = await Promise.all([
    getStyle(token, styleId),
    getMuscleMapTarget(token, ref),
  ]);
  if (!style) throw new GenerationError("Style not found", 404);
  if (!target) throw new GenerationError("Muscle or group not found", 404);
  const baseFileId = style.muscle_bases.find(
    (b) => b.view === slot.view && b.crop === slot.crop,
  )?.file_id;
  if (!baseFileId) {
    throw new GenerationError(
      `This style has no ${muscleMapSlotLabel(slot)} base: add it on Styles → Assets first`,
      409,
    );
  }

  const [template, references] = await Promise.all([
    listImagePromptsForStyle(token, styleId).then((slots) => slots.muscleMap),
    resolveRunReferences(token, styleId, ref, referenceIds),
  ]);
  const versions = await currentPromptVersions(token, [template.id]);
  // Input 1 is the base; library references follow from input 2.
  const prompt = [
    fillMuscleMapTemplate(promptOverride ?? template.content, {
      ...slot,
      background_color: style.params.background_color,
      target,
    }),
    muscleBaseDirective(slot),
    ...references.map((reference, i) => libraryReferenceDirective(i + 2, reference)),
  ].join("\n\n");

  const base = await downloadImageFile(token, baseFileId);
  const result = await editImage(
    prompt,
    style.params,
    [
      { bytes: base.bytes, mimeType: base.contentType },
      ...(await loadReferenceInputs(token, references)),
    ],
    { useFidelity: true },
  );

  const uploaded = await uploadImageFile({
    token,
    bytes: result.bytes,
    mimeType: result.mimeType,
    name: muscleMapFileName(
      style.code,
      { kind: ref.kind, code: target.code },
      slot,
      extensionForMime(result.mimeType),
    ),
  });
  const insert = () =>
    insertMuscleMapImage(token, {
      style_id: styleId,
      target: ref,
      slot,
      file_id: uploaded.id,
      image_url: uploaded.url,
      model: style.params.model,
      prompt,
      params: {
        ...style.params,
        base_file_id: baseFileId,
        prompt_id: template.id,
        prompt_edited: promptOverride != null,
        prompt_saved_at: versions.get(template.id)?.saved_at ?? null,
        reference_ids: references.map((r) => r.id),
      },
      usage: result.usage,
      created_by: getUserIdFromToken(token),
      active: !candidate,
    });

  if (candidate) return insert();
  await clearActiveMuscleMap(token, styleId, ref, slot);
  let image;
  try {
    image = await insert();
  } catch (error) {
    if (!(error instanceof Error && /uniqueness|unique/i.test(error.message))) throw error;
    await clearActiveMuscleMap(token, styleId, ref, slot);
    image = await insert();
  }
  return image;
}
