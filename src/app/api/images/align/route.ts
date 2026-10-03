import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { isIdentityNudge } from "@/lib/images/nudge";
import { repositionFrame } from "@/lib/images/reposition";
import {
  clearActivePosition,
  getExerciseImage,
  getExerciseSummary,
  getStyle,
  getUserIdFromToken,
  insertExerciseImage,
} from "@/lib/images/queries";
import { frameFileName } from "@/lib/images/reference";
import { downloadImageFile, uploadImageFile } from "@/lib/images/storage";

export const maxDuration = 60;

const nudgeSchema = z.object({
  imageId: z.string().uuid(),
  dx: z.number().min(-1).max(1),
  dy: z.number().min(-1).max(1),
  scale: z.number().min(0.2).max(3),
});

const bodySchema = z.object({
  exoId: z.number().int().positive(),
  styleId: z.string().uuid(),
  subject: z.enum(["man", "woman"]),
  adjustments: z.array(nudgeSchema).min(1).max(3),
});

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = bodySchema.parse(await request.json());
    const { exoId, styleId, subject } = body;

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

    const params = style.params;
    const format = params.format as "png" | "webp" | "jpeg";
    const mimeType =
      format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    const extension = format === "jpeg" ? "jpg" : format;

    const images = [];
    for (const adj of body.adjustments) {
      if (isIdentityNudge(adj)) continue;

      const current = await getExerciseImage(token, adj.imageId);
      if (!current) {
        return NextResponse.json({ error: `Image ${adj.imageId} not found` }, { status: 404 });
      }
      if (
        current.exo_id !== exercise.exo_id ||
        current.style_id !== styleId ||
        current.subject !== subject ||
        !current.active ||
        current.position == null
      ) {
        return NextResponse.json(
          { error: "Each adjustment must be an active frame of this exercise/style/subject" },
          { status: 409 },
        );
      }

      const file = await downloadImageFile(token, current.file_id);
      const bytes = await repositionFrame(
        file.bytes,
        { dx: adj.dx, dy: adj.dy, scale: adj.scale },
        format,
        params.compression,
        params.background_color,
      );
      const uploaded = await uploadImageFile({
        token,
        bytes,
        mimeType,
        name: frameFileName(style.code, exercise.exo_id, subject, current.position, extension),
      });

      const snapshot = {
        ...(current.params ?? params),
        ...params,
        target_position: current.position,
        frame_align: true,
        align_source_image_id: current.id,
        align_dx: adj.dx,
        align_dy: adj.dy,
        align_scale: adj.scale,
      };

      const position = current.position;
      const insert = () =>
        insertExerciseImage(token, {
          style_id: styleId,
          exo_id: exercise.exo_id,
          subject,
          file_id: uploaded.id,
          image_url: uploaded.url,
          model: "frame-align",
          prompt: current.prompt,
          params: snapshot,
          usage: null,
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
      images.push(image);
    }

    if (images.length === 0) {
      return NextResponse.json({ error: "Nothing to save (no shifts applied)" }, { status: 400 });
    }

    return NextResponse.json({ images });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Align failed" },
      { status: 502 },
    );
  }
}
