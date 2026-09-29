import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { resolveSize, sequenceStripSize } from "@/lib/images/capabilities";
import { editImage, generateImage } from "@/lib/images/openai";
import { assembleSequencePrompt, selectedPrompts } from "@/lib/images/prompt";
import {
  clearActivePosition,
  getExerciseSummary,
  getUserIdFromToken,
  insertExerciseImage,
  listImagePrompts,
  loadSettings,
} from "@/lib/images/queries";
import { REFERENCE_USE_DIRECTIVE } from "@/lib/images/reference";
import { SplitError, sequenceDirective, splitSequence } from "@/lib/images/sequence";
import { downloadImageFile, uploadImageFile } from "@/lib/images/storage";
import { FRAME_POSITIONS, REFERENCE_KEYS } from "@/lib/images/types";
import type { ExerciseImage } from "@/lib/images/types";

export const maxDuration = 300;

const bodySchema = z.object({
  exoId: z.number().int().positive(),
  subject: z.enum(["man", "woman"]),
});

/** Generates Start, Mid and End in one strip so all three share scale, then splits it. */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const { exoId, subject } = bodySchema.parse(await request.json());

    const exercise = await getExerciseSummary(token, exoId);
    if (!exercise) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }
    const [settings, prompts] = await Promise.all([loadSettings(token), listImagePrompts(token)]);
    const { params } = settings;
    const stripSize = sequenceStripSize(params);
    if (!stripSize) {
      return NextResponse.json(
        { error: "Sequence generation needs a custom-size model and a square or portrait shape" },
        { status: 400 },
      );
    }

    const chosen = FRAME_POSITIONS.map((frame) => selectedPrompts(settings, prompts, frame.id));
    const system = chosen[0].system;
    const positionPrompts = chosen.map((c) => c.position);
    if (!system || positionPrompts.some((p) => !p)) {
      return NextResponse.json({ error: "Prompt templates missing" }, { status: 400 });
    }

    const description =
      exercise.localizations.find((l) => l.locale === "en")?.description ??
      exercise.localizations.find((l) => l.description)?.description ??
      "";
    const referenceFileId = settings[REFERENCE_KEYS[subject]];
    const basePrompt = assembleSequencePrompt({
      systemContent: system.content,
      positionContents: positionPrompts.map((p) => p!.content) as [string, string, string],
      layoutDirective: sequenceDirective(),
      name: exercise.display_name,
      description,
      exo_id: exercise.exo_id,
      id: exercise.id,
      subject,
      background_color: params.background_color,
    });
    const prompt = referenceFileId ? `${basePrompt}\n\n${REFERENCE_USE_DIRECTIVE}` : basePrompt;

    let result;
    if (referenceFileId) {
      const reference = await downloadImageFile(token, referenceFileId);
      result = await editImage(
        prompt,
        params,
        { bytes: reference.bytes, mimeType: reference.contentType },
        { size: stripSize, useFidelity: true },
      );
    } else {
      result = await generateImage(prompt, params, { size: stripSize });
    }

    const format = params.format as "png" | "webp" | "jpeg";
    const { frames, cuts } = await splitSequence(
      result.bytes,
      resolveSize(params),
      format,
      params.compression,
    );

    const extension = format === "jpeg" ? "jpg" : format;
    const stamp = Date.now();
    const uploaded = await Promise.all(
      frames.map((frame, position) =>
        uploadImageFile({
          token,
          bytes: frame.bytes,
          mimeType: result.mimeType,
          name: `exo_${exercise.exo_id}/${stamp}_seq_p${position}.${extension}`,
        }),
      ),
    );

    const images: ExerciseImage[] = [];
    for (const [position, file] of uploaded.entries()) {
      await clearActivePosition(token, exercise.exo_id, position);
      images.push(
        await insertExerciseImage(token, {
          exo_id: exercise.exo_id,
          file_id: file.id,
          image_url: file.url,
          model: params.model,
          prompt,
          params: {
            ...params,
            target_position: position,
            subject,
            reference_file_id: referenceFileId,
            system_prompt_id: system.id,
            position_prompt_id: positionPrompts[position]!.id,
            feet_shift_px: frames[position].shiftPx,
            sequence: { strip_size: stripSize, cuts },
          },
          usage: position === 0 ? result.usage : null,
          created_by: getUserIdFromToken(token),
          position,
          active: true,
        }),
      );
    }

    return NextResponse.json({ images });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    if (error instanceof SplitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sequence generation failed" },
      { status: 502 },
    );
  }
}
