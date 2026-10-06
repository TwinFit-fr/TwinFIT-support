import { editImage, generateImage } from "@/lib/images/openai";
import { assembleImagePrompt, exerciseDetails, selectedPrompts } from "@/lib/images/prompt";
import {
  clearActivePosition,
  ensureTwoFramesDefault,
  getActiveImageAtPosition,
  getExerciseImage,
  getExerciseSummary,
  getStyle,
  getUserIdFromToken,
  insertExerciseImage,
  listImagePrompts,
} from "@/lib/images/queries";
import { alignFeetBaseline } from "@/lib/images/align";
import { loadLogoInput } from "@/lib/images/logo";
import {
  LOGO_DIRECTIVE,
  REFERENCE_USE_DIRECTIVE,
  START_GUIDE_DIRECTIVE,
  SUPPORT_REFERENCE_DIRECTIVE,
  frameFileName,
  libraryReferenceDirective,
} from "@/lib/images/reference";
import { loadReferenceInputs, resolveRunReferences } from "@/lib/images/references";
import { downloadImageFile, uploadImageFile } from "@/lib/images/storage";
import { MID_POSITION, targetPosition } from "@/lib/images/types";
import type { ExerciseImage, Subject } from "@/lib/images/types";
import { GenerationError } from "./generation-error";
import type { SkippableInput } from "./job-types";

/** One exercise frame to generate; Mid/End edit `guideImageId` or the subject's active Start. */
export type FrameRequest = {
  exoId: number;
  styleId: string;
  position: number;
  subject: Subject;
  systemOverride?: string;
  positionOverride?: string;
  guideImageId?: string;
  /** Library references for this run; omitted = the ones linked to the exercise. */
  referenceIds?: string[];
  /** Automatic inputs left out of this run. */
  skipInputs?: SkippableInput[];
  /** Keep it as an inactive candidate for its position; the active frame stays. */
  candidate?: boolean;
};

/**
 * Generates one frame and stores it as the active image of its position (the previous one stays
 * in history), or as an inactive candidate for that position. Throws GenerationError when the request cannot succeed as asked.
 */
export async function generateExerciseFrame(
  token: string,
  body: FrameRequest,
): Promise<ExerciseImage> {
  const { exoId, styleId, position, systemOverride, positionOverride } = body;

  const [exercise, style] = await Promise.all([
    getExerciseSummary(token, exoId),
    getStyle(token, styleId),
  ]);
  if (!exercise) {
    throw new GenerationError("Exercise not found", 404);
  }
  if (!style) {
    throw new GenerationError("Style not found", 404);
  }

  const twoFrames = await ensureTwoFramesDefault(token, exoId, styleId);
  if (twoFrames && position === MID_POSITION) {
    throw new GenerationError(
      "This exercise uses two frames (Start + End); Mid cannot be generated",
      409,
    );
  }

  const prompts = await listImagePrompts(token, styleId);
  const { params } = style;
  const chosen = selectedPrompts(prompts, position);
  if (!chosen.system || !chosen.position) {
    throw new GenerationError(`Prompt templates missing (system or position ${position})`, 400);
  }

  let usableGuide: ExerciseImage | null = null;
  if (position !== 0) {
    usableGuide = body.guideImageId
      ? await getExerciseImage(token, body.guideImageId)
      : await getActiveImageAtPosition(token, styleId, exercise.exo_id, body.subject, 0);
    const isStart =
      usableGuide?.exo_id === exercise.exo_id &&
      usableGuide.style_id === styleId &&
      usableGuide.subject === body.subject &&
      (usableGuide.position === 0 || targetPosition(usableGuide) === 0);
    if (!isStart) {
      throw new GenerationError(
        body.guideImageId
          ? "Guide image is not a Start frame of this exercise/style/subject"
          : "No active Start frame: generate Start first",
        409,
      );
    }
  }

  const subject: Subject = usableGuide?.subject ?? body.subject;
  const skip = new Set(body.skipInputs ?? []);
  const characterFileId =
    usableGuide || skip.has("character")
      ? null
      : (style.characters.find((c) => c.subject === subject)?.file_id ?? null);
  const supportId = exercise.support_equipment?.id ?? null;
  const supportFileId =
    !usableGuide && supportId && !skip.has("support")
      ? (style.supports.find((s) => s.support_equipment_id === supportId)?.file_id ?? null)
      : null;

  const description =
    exercise.localizations.find((l) => l.locale === "en")?.description ??
    exercise.localizations.find((l) => l.description)?.description ??
    "";
  const basePrompt = assembleImagePrompt({
    systemContent: systemOverride ?? chosen.system.content,
    positionContent: positionOverride ?? chosen.position.content,
    name: exercise.display_name,
    description,
    exo_id: exercise.exo_id,
    id: exercise.id,
    subject,
    background_color: params.background_color,
    details: exerciseDetails(exercise),
  });
  // Library references belong to the Start: Mid/End copy them from the Start they edit.
  const references = usableGuide
    ? []
    : await resolveRunReferences(
        token,
        styleId,
        { kind: "exercise", id: exercise.exo_id },
        body.referenceIds,
      );
  const logo =
    style.logo_in_exercises && !skip.has("logo") ? await loadLogoInput(token, style) : null;

  // Input order: guide or character, support, library references, logo.
  const inputs = [];
  const primaryFileId = usableGuide?.file_id ?? characterFileId;
  if (primaryFileId) {
    const input = await downloadImageFile(token, primaryFileId);
    inputs.push({ bytes: input.bytes, mimeType: input.contentType });
  }
  let supportSent = false;
  if (supportFileId) {
    try {
      const support = await downloadImageFile(token, supportFileId);
      inputs.push({ bytes: support.bytes, mimeType: support.contentType });
      supportSent = true;
    } catch {
      /* missing support ref must not block generation */
    }
  }
  const firstReferenceInput = inputs.length + 1;
  inputs.push(...(await loadReferenceInputs(token, references)));
  if (logo) inputs.push(logo);

  const directives = [
    usableGuide ? START_GUIDE_DIRECTIVE : characterFileId ? REFERENCE_USE_DIRECTIVE : null,
    supportSent ? SUPPORT_REFERENCE_DIRECTIVE : null,
    ...references.map((reference, i) =>
      libraryReferenceDirective(firstReferenceInput + i, reference),
    ),
    logo ? LOGO_DIRECTIVE : null,
  ].filter(Boolean);
  const prompt = [basePrompt, ...directives].join("\n\n");

  const result = inputs.length
    ? await editImage(prompt, params, inputs, { useFidelity: Boolean(primaryFileId) })
    : await generateImage(prompt, params);

  const aligned = await alignFeetBaseline(
    result.bytes,
    params.format as "png" | "webp" | "jpeg",
    params.compression,
  );

  const extension = params.format === "jpeg" ? "jpg" : params.format;
  const uploaded = await uploadImageFile({
    token,
    bytes: aligned.bytes,
    mimeType: result.mimeType,
    name: frameFileName(style.code, exercise.exo_id, subject, position, extension),
  });

  const snapshot = {
    ...params,
    target_position: position,
    reference_file_id: characterFileId,
    skipped_inputs: [...skip],
    support_reference_file_id: supportSent ? supportFileId : null,
    reference_ids: references.map((r) => r.id),
    guide_image_id: usableGuide?.id ?? null,
    logo_sent: Boolean(logo),
    feet_shift_px: aligned.shiftPx,
    system_prompt_id: chosen.system.id,
    position_prompt_id: chosen.position.id,
    system_prompt_edited: systemOverride != null,
    position_prompt_edited: positionOverride != null,
  };
  const insert = () =>
    insertExerciseImage(token, {
      style_id: styleId,
      exo_id: exercise.exo_id,
      subject,
      file_id: uploaded.id,
      image_url: uploaded.url,
      model: params.model,
      prompt,
      params: snapshot,
      usage: result.usage,
      created_by: getUserIdFromToken(token),
      position: body.candidate ? null : position,
      active: !body.candidate,
    });

  // A candidate keeps target_position in its snapshot and waits in history to be picked.
  if (body.candidate) return insert();
  await clearActivePosition(token, styleId, exercise.exo_id, subject, position);
  let image;
  try {
    image = await insert();
  } catch (error) {
    if (!(error instanceof Error && /uniqueness|unique/i.test(error.message))) throw error;
    await clearActivePosition(token, styleId, exercise.exo_id, subject, position);
    image = await insert();
  }

  return image;
}
