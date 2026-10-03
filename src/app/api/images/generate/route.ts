import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { editImage, generateImage } from "@/lib/images/openai";
import { assembleImagePrompt, exerciseDetails, selectedPrompts } from "@/lib/images/prompt";
import { invalidSystemPrompt } from "@/lib/images/prompt-checks";
import {
  clearActivePosition,
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
} from "@/lib/images/reference";
import { downloadImageFile, uploadImageFile } from "@/lib/images/storage";
import { targetPosition } from "@/lib/images/types";
import type { ExerciseImage, Subject } from "@/lib/images/types";

export const maxDuration = 300;

const promptText = z.string().trim().min(1).max(32000);

const bodySchema = z.object({
  exoId: z.number().int().positive(),
  styleId: z.string().uuid(),
  position: z.number().int().min(0).max(2),
  subject: z.enum(["man", "woman"]),
  systemOverride: promptText.optional(),
  systemPromptId: z.string().uuid().optional(),
  positionOverride: promptText.optional(),
  guideImageId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = bodySchema.parse(await request.json());
    const { exoId, styleId, position, systemOverride, positionOverride } = body;

    const [exercise, style] = await Promise.all([
      getExerciseSummary(token, exoId),
      getStyle(token, styleId),
    ]);
    if (!exercise) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }
    if (!style) {
      return NextResponse.json({ error: "Style not found" }, { status: 404 });
    }

    const prompts = await listImagePrompts(token);
    const { params } = style;
    const unknownSystem = invalidSystemPrompt(prompts, body.systemPromptId);
    if (unknownSystem) return unknownSystem;
    const chosen = selectedPrompts(
      { ...style, system_prompt_id: body.systemPromptId ?? style.system_prompt_id },
      prompts,
      position,
    );
    if (!chosen.system || !chosen.position) {
      return NextResponse.json(
        { error: `Prompt templates missing (system or position ${position})` },
        { status: 400 },
      );
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
        return NextResponse.json(
          {
            error: body.guideImageId
              ? "Guide image is not a Start frame of this exercise/style/subject"
              : "No active Start frame: generate Start first",
          },
          { status: 409 },
        );
      }
    }

    const subject: Subject = usableGuide?.subject ?? body.subject;
    const characterFileId = usableGuide
      ? null
      : (style.characters.find((c) => c.subject === subject)?.file_id ?? null);
    const supportId = exercise.support_equipment?.id ?? null;
    const supportFileId =
      !usableGuide && supportId
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
    const logo = style.logo_in_exercises ? await loadLogoInput(token, style) : null;
    const directives = [
      usableGuide
        ? START_GUIDE_DIRECTIVE
        : characterFileId
          ? REFERENCE_USE_DIRECTIVE
          : null,
      supportFileId ? SUPPORT_REFERENCE_DIRECTIVE : null,
      logo ? LOGO_DIRECTIVE : null,
    ].filter(Boolean);
    const prompt = [basePrompt, ...directives].join("\n\n");

    const inputs = [];
    const primaryFileId = usableGuide?.file_id ?? characterFileId;
    if (primaryFileId) {
      const input = await downloadImageFile(token, primaryFileId);
      inputs.push({ bytes: input.bytes, mimeType: input.contentType });
    }
    if (supportFileId) {
      try {
        const support = await downloadImageFile(token, supportFileId);
        inputs.push({ bytes: support.bytes, mimeType: support.contentType });
      } catch {
        /* missing support ref must not block generation */
      }
    }
    if (logo) inputs.push(logo);

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
      support_reference_file_id: supportFileId,
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
        position,
        active: true,
      });

    await clearActivePosition(token, styleId, exercise.exo_id, subject, position);
    let image;
    try {
      image = await insert();
    } catch (error) {
      if (!(error instanceof Error && /uniqueness|unique/i.test(error.message))) throw error;
      await clearActivePosition(token, styleId, exercise.exo_id, subject, position);
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
