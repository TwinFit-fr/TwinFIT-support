import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { editImage, generateImage } from "@/lib/images/openai";
import { assembleImagePrompt, selectedPrompts } from "@/lib/images/prompt";
import {
  clearActivePosition,
  getActiveImageAtPosition,
  getExerciseImage,
  getExerciseSummary,
  getUserIdFromToken,
  insertExerciseImage,
  listImagePrompts,
  loadSettings,
} from "@/lib/images/queries";
import { alignFeetBaseline } from "@/lib/images/align";
import { REFERENCE_USE_DIRECTIVE, START_GUIDE_DIRECTIVE } from "@/lib/images/reference";
import { downloadImageFile, uploadImageFile } from "@/lib/images/storage";
import { REFERENCE_KEYS, targetPosition } from "@/lib/images/types";
import type { Subject } from "@/lib/images/types";

export const maxDuration = 300;

const bodySchema = z
  .object({
    exoId: z.number().int().positive(),
    mode: z.enum(["generate", "refine"]).default("generate"),
    position: z.number().int().min(0).max(2).optional().nullable(),
    subject: z.enum(["man", "woman"]).optional().nullable(),
    sourceImageId: z.string().uuid().optional().nullable(),
    instruction: z.string().optional().nullable(),
  })
  .refine((body) => body.mode !== "generate" || (body.position != null && body.subject != null), {
    message: "position and subject are required for generate",
    path: ["position"],
  })
  .refine((body) => body.mode !== "refine" || Boolean(body.sourceImageId), {
    message: "sourceImageId is required for refine",
    path: ["sourceImageId"],
  });

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = bodySchema.parse(await request.json());

    const exercise = await getExerciseSummary(token, body.exoId);
    if (!exercise) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }

    const source =
      body.mode === "refine" && body.sourceImageId
        ? await getExerciseImage(token, body.sourceImageId)
        : null;
    if (body.mode === "refine") {
      if (!source?.file_id) throw new Error("Source image not found");
      if (source.exo_id !== exercise.exo_id) {
        throw new Error("Source image belongs to a different exercise");
      }
    }
    const position = source
      ? (targetPosition(source) ?? source.position ?? body.position ?? 0)
      : (body.position as number);
    const subject: Subject = source?.params?.subject ?? body.subject ?? "man";

    const [settings, prompts] = await Promise.all([loadSettings(token), listImagePrompts(token)]);
    const { params } = settings;
    const chosen = selectedPrompts(settings, prompts, position);
    if (!chosen.system || !chosen.position) {
      return NextResponse.json(
        { error: `Prompt templates missing (system or position ${position})` },
        { status: 400 },
      );
    }

    // Mid/End are edits of the active Start frame (same subject) so camera and scale match it.
    const guide =
      !source && position !== 0 ? await getActiveImageAtPosition(token, exercise.exo_id, 0) : null;
    const usableGuide = guide && (guide.params?.subject ?? subject) === subject ? guide : null;
    const referenceFileId = source || usableGuide ? null : settings[REFERENCE_KEYS[subject]];

    const description =
      exercise.localizations.find((l) => l.locale === "en")?.description ??
      exercise.localizations.find((l) => l.description)?.description ??
      "";
    const basePrompt = assembleImagePrompt({
      systemContent: chosen.system.content,
      positionContent: chosen.position.content,
      name: exercise.display_name,
      description,
      exo_id: exercise.exo_id,
      id: exercise.id,
      subject,
      background_color: params.background_color,
      instruction: body.mode === "refine" ? body.instruction : null,
    });
    const directive = usableGuide
      ? START_GUIDE_DIRECTIVE
      : referenceFileId
        ? REFERENCE_USE_DIRECTIVE
        : null;
    const prompt = directive ? `${basePrompt}\n\n${directive}` : basePrompt;

    const inputFileId = source?.file_id ?? usableGuide?.file_id ?? referenceFileId;
    let result;
    if (inputFileId) {
      const input = await downloadImageFile(token, inputFileId);
      result = await editImage(
        prompt,
        params,
        { bytes: input.bytes, mimeType: input.contentType },
        { useFidelity: !source },
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

    // New generations take their position right away; the previous frame there is deactivated.
    const activate = body.mode === "generate";
    const snapshot = {
      ...params,
      target_position: position,
      subject,
      reference_file_id: referenceFileId,
      guide_image_id: usableGuide?.id ?? null,
      feet_shift_px: aligned.shiftPx,
      system_prompt_id: chosen.system.id,
      position_prompt_id: chosen.position.id,
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
        position: activate ? position : null,
        active: activate,
      });

    let image;
    if (activate) {
      await clearActivePosition(token, exercise.exo_id, position);
      try {
        image = await insert();
      } catch (error) {
        // Another request activated this position meanwhile: displace it and retry once.
        if (!(error instanceof Error && /uniqueness|unique/i.test(error.message))) throw error;
        await clearActivePosition(token, exercise.exo_id, position);
        image = await insert();
      }
    } else {
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
