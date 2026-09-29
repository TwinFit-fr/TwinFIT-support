import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { editImage, generateImage } from "@/lib/images/openai";
import { assembleImagePrompt, selectedPrompts } from "@/lib/images/prompt";
import {
  clearActivePosition,
  getActiveImageAtPosition,
  getExerciseSummary,
  getUserIdFromToken,
  insertExerciseImage,
  listImagePrompts,
  loadSettings,
} from "@/lib/images/queries";
import { alignFeetBaseline } from "@/lib/images/align";
import { REFERENCE_USE_DIRECTIVE, START_GUIDE_DIRECTIVE } from "@/lib/images/reference";
import { downloadImageFile, uploadImageFile } from "@/lib/images/storage";
import { REFERENCE_KEYS } from "@/lib/images/types";
import type { Subject } from "@/lib/images/types";

export const maxDuration = 300;

const promptText = z.string().trim().min(1).max(32000);

const bodySchema = z.object({
  exoId: z.number().int().positive(),
  position: z.number().int().min(0).max(2),
  subject: z.enum(["man", "woman"]),
  /** One-off prompt texts for this generation only; never persisted as templates. */
  systemOverride: promptText.optional(),
  positionOverride: promptText.optional(),
  /** Mid/End: edit the active Start frame (default). False generates from the reference. */
  useStartContext: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = bodySchema.parse(await request.json());
    const { exoId, position, systemOverride, positionOverride } = body;

    const exercise = await getExerciseSummary(token, exoId);
    if (!exercise) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }

    const [settings, prompts] = await Promise.all([loadSettings(token), listImagePrompts(token)]);
    const { params } = settings;
    const chosen = selectedPrompts(settings, prompts, position);
    if (!chosen.system || !chosen.position) {
      return NextResponse.json(
        { error: `Prompt templates missing (system or position ${position})` },
        { status: 400 },
      );
    }

    // Mid/End are edits of the active Start frame so camera, scale and character match it;
    // the subject then follows the Start's so one exercise never mixes man and woman.
    const usableGuide =
      position !== 0 && body.useStartContext
        ? await getActiveImageAtPosition(token, exercise.exo_id, 0)
        : null;
    const subject: Subject = usableGuide?.params?.subject ?? body.subject;
    const referenceFileId = usableGuide ? null : settings[REFERENCE_KEYS[subject]];

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
    });
    const directive = usableGuide
      ? START_GUIDE_DIRECTIVE
      : referenceFileId
        ? REFERENCE_USE_DIRECTIVE
        : null;
    const prompt = directive ? `${basePrompt}\n\n${directive}` : basePrompt;

    const inputFileId = usableGuide?.file_id ?? referenceFileId;
    let result;
    if (inputFileId) {
      const input = await downloadImageFile(token, inputFileId);
      result = await editImage(
        prompt,
        params,
        { bytes: input.bytes, mimeType: input.contentType },
        { useFidelity: true },
      );
    } else {
      result = await generateImage(prompt, params);
    }

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
      name: `exo_${exercise.exo_id}/${Date.now()}_p${position}.${extension}`,
    });

    const snapshot = {
      ...params,
      target_position: position,
      subject,
      reference_file_id: referenceFileId,
      guide_image_id: usableGuide?.id ?? null,
      feet_shift_px: aligned.shiftPx,
      system_prompt_id: chosen.system.id,
      position_prompt_id: chosen.position.id,
      system_prompt_edited: systemOverride != null,
      position_prompt_edited: positionOverride != null,
    };
    const insert = () =>
      insertExerciseImage(token, {
        exo_id: exercise.exo_id,
        file_id: uploaded.id,
        image_url: uploaded.url,
        model: params.model,
        prompt,
        params: snapshot,
        usage: result.usage,
        created_by: getUserIdFromToken(token),
        position,
        active: true,
      });

    // New generations take their position right away; the previous frame there is deactivated.
    await clearActivePosition(token, exercise.exo_id, position);
    let image;
    try {
      image = await insert();
    } catch (error) {
      // Another request activated this position meanwhile: displace it and retry once.
      if (!(error instanceof Error && /uniqueness|unique/i.test(error.message))) throw error;
      await clearActivePosition(token, exercise.exo_id, position);
      image = await insert();
    }

    return NextResponse.json({ image });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    const cause =
      error instanceof Error && "cause" in error && error.cause instanceof Error
        ? error.cause.message
        : null;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Generation failed",
        ...(cause ? { cause } : {}),
      },
      { status: 502 },
    );
  }
}
