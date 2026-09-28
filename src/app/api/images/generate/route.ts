import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import {
  DEFAULT_GENERATION_PARAMS,
  generateImage,
  refineImage,
} from "@/lib/images/openai";
import { assembleImagePrompt } from "@/lib/images/prompt";
import {
  clearActivePosition,
  getExerciseImage,
  getExerciseSummary,
  getImagePrompt,
  getUserIdFromToken,
  insertExerciseImage,
  listImagePrompts,
} from "@/lib/images/queries";
import { downloadImageFile, uploadImageFile } from "@/lib/images/storage";

export const maxDuration = 300;

const bodySchema = z.object({
  exoId: z.number().int().positive(),
  mode: z.enum(["generate", "refine"]).default("generate"),
  sourceImageId: z.string().uuid().optional().nullable(),
  instruction: z.string().optional().nullable(),
  systemPromptId: z.string().uuid().optional().nullable(),
  exercisePromptId: z.string().uuid().optional().nullable(),
  position: z.number().int().min(0).optional().nullable(),
  activate: z.boolean().optional(),
  params: z
    .object({
      model: z.string().min(1),
      shape: z.string().min(1),
      size: z.string().min(1),
      background: z.string().min(1),
      format: z.string().min(1),
      quality: z.string().min(1),
    })
    .partial()
    .optional(),
});

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = bodySchema.parse(await request.json());
    const params = { ...DEFAULT_GENERATION_PARAMS, ...(body.params ?? {}) };

    const exercise = await getExerciseSummary(token, body.exoId);
    if (!exercise) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }

    const prompts = await listImagePrompts(token);
    const system =
      (body.systemPromptId
        ? await getImagePrompt(token, body.systemPromptId)
        : null) ??
      prompts.find((p) => p.kind === "system" && p.is_default) ??
      prompts.find((p) => p.kind === "system");
    const exercisePrompt =
      (body.exercisePromptId
        ? await getImagePrompt(token, body.exercisePromptId)
        : null) ??
      prompts.find((p) => p.kind === "exercise" && p.is_default) ??
      prompts.find((p) => p.kind === "exercise");

    if (!system || !exercisePrompt) {
      return NextResponse.json({ error: "Prompt templates missing" }, { status: 400 });
    }

    const description =
      exercise.localizations.find((l) => l.locale === "en")?.description ??
      exercise.localizations.find((l) => l.description)?.description ??
      "";
    const prompt = assembleImagePrompt({
      systemContent: system.content,
      exerciseContent: exercisePrompt.content,
      name: exercise.display_name,
      description,
      exo_id: exercise.exo_id,
      id: exercise.id,
      instruction: body.mode === "refine" ? body.instruction : null,
    });

    if (body.mode === "refine" && !body.sourceImageId) {
      return NextResponse.json(
        { error: "sourceImageId is required for refine" },
        { status: 400 },
      );
    }

    let result;
    if (body.mode === "refine" && body.sourceImageId) {
      const source = await getExerciseImage(token, body.sourceImageId);
      if (!source?.file_id) {
        throw new Error("Source image not found");
      }
      if (source.exo_id !== exercise.exo_id) {
        throw new Error("Source image belongs to a different exercise");
      }
      const downloaded = await downloadImageFile(token, source.file_id);
      result = await refineImage(
        prompt,
        params,
        downloaded.bytes,
        downloaded.contentType,
      );
    } else {
      result = await generateImage(prompt, params);
    }

    const extension = params.format === "jpeg" ? "jpg" : params.format;
    const uploaded = await uploadImageFile({
      token,
      bytes: result.bytes,
      mimeType: result.mimeType,
      name: `exo_${exercise.exo_id}/${Date.now()}.${extension}`,
      metadata: {
        exoId: String(exercise.exo_id),
      },
    });

    const activate = Boolean(body.activate);
    const position = activate ? (body.position ?? null) : null;
    if (activate && position == null) {
      return NextResponse.json(
        { error: "position is required when activate=true" },
        { status: 400 },
      );
    }

    if (activate && position != null) {
      await clearActivePosition(token, exercise.exo_id, position);
    }

    const image = await insertExerciseImage(token, {
      exo_id: exercise.exo_id,
      file_id: uploaded.id,
      image_url: uploaded.url,
      model: params.model,
      prompt,
      params,
      usage: result.usage,
      created_by: getUserIdFromToken(token),
      position,
      active: activate,
    });

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
