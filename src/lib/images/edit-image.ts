import { alignFeetBaseline } from "./align";
import { GenerationError } from "./generation-error";
import { getMuscleMapImage, getMuscleMapTarget, insertMuscleMapImage } from "./muscle-maps";
import { editImage } from "./openai";
import { getExerciseImage, getStyle, getUserIdFromToken, insertExerciseImage } from "./queries";
import { frameFileName, imageEditDirective, muscleMapFileName } from "./reference";
import { downloadImageFile, uploadImageFile } from "./storage";
import { extensionForMime } from "./style-assets";
import type { ExerciseImage, MuscleMapImage } from "./types";
import { muscleMapTargetOf, targetPosition } from "./types";

/** An existing image and what to change in it. */
export type EditRequest = { styleId: string; sourceId: string; instruction: string };

async function styleOrFail(token: string, styleId: string) {
  const style = await getStyle(token, styleId);
  if (!style) throw new GenerationError("Style not found", 404);
  return style;
}

/**
 * Applies an instruction to an exercise frame. The result is an inactive candidate for the
 * frame's position, next to the original, to compare and pick with Set as.
 */
export async function editExerciseFrame(
  token: string,
  { styleId, sourceId, instruction }: EditRequest,
): Promise<ExerciseImage> {
  const [source, style] = await Promise.all([
    getExerciseImage(token, sourceId),
    styleOrFail(token, styleId),
  ]);
  if (!source || source.style_id !== styleId) {
    throw new GenerationError("The frame to edit was not found in this style", 404);
  }
  const position = source.active ? source.position : targetPosition(source);
  if (position == null) throw new GenerationError("The frame to edit has no position", 409);

  const prompt = imageEditDirective(instruction);
  const input = await downloadImageFile(token, source.file_id);
  const result = await editImage(
    prompt,
    style.params,
    [{ bytes: input.bytes, mimeType: input.contentType }],
    { useFidelity: true },
  );
  const aligned = await alignFeetBaseline(
    result.bytes,
    style.params.format as "png" | "webp" | "jpeg",
    style.params.compression,
  );
  const extension = style.params.format === "jpeg" ? "jpg" : style.params.format;
  const uploaded = await uploadImageFile({
    token,
    bytes: aligned.bytes,
    mimeType: result.mimeType,
    name: frameFileName(style.code, source.exo_id, source.subject, position, extension),
  });
  return insertExerciseImage(token, {
    style_id: styleId,
    exo_id: source.exo_id,
    subject: source.subject,
    file_id: uploaded.id,
    image_url: uploaded.url,
    model: style.params.model,
    prompt,
    params: {
      ...style.params,
      target_position: position,
      edit_of: source.id,
      edit_instruction: instruction.trim(),
      feet_shift_px: aligned.shiftPx,
    },
    usage: result.usage,
    created_by: getUserIdFromToken(token),
    position: null,
    active: false,
  });
}

/** Applies an instruction to a muscle map; the result is an inactive candidate of its view. */
export async function editMuscleMap(
  token: string,
  { styleId, sourceId, instruction }: EditRequest,
): Promise<MuscleMapImage> {
  const [source, style] = await Promise.all([
    getMuscleMapImage(token, sourceId),
    styleOrFail(token, styleId),
  ]);
  if (!source || source.style_id !== styleId) {
    throw new GenerationError("The map to edit was not found in this style", 404);
  }
  const ref = muscleMapTargetOf(source);
  const target = ref ? await getMuscleMapTarget(token, ref) : null;
  if (!ref || !target) throw new GenerationError("Muscle map target not found", 404);

  const prompt = imageEditDirective(instruction);
  const input = await downloadImageFile(token, source.file_id);
  const result = await editImage(
    prompt,
    style.params,
    [{ bytes: input.bytes, mimeType: input.contentType }],
    { useFidelity: true },
  );
  const uploaded = await uploadImageFile({
    token,
    bytes: result.bytes,
    mimeType: result.mimeType,
    name: muscleMapFileName(
      style.code,
      { kind: ref.kind, code: target.code },
      source.view,
      extensionForMime(result.mimeType),
    ),
  });
  return insertMuscleMapImage(token, {
    style_id: styleId,
    target: ref,
    view: source.view,
    file_id: uploaded.id,
    image_url: uploaded.url,
    model: style.params.model,
    prompt,
    params: { ...style.params, edit_of: source.id, edit_instruction: instruction.trim() },
    usage: result.usage,
    created_by: getUserIdFromToken(token),
    active: false,
  });
}
