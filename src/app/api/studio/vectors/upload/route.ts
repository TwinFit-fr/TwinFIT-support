import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { CLIP_EXTENSIONS, describeKeyframeJson } from "@/lib/studio/clip-files";
import { createVector, deleteVector, updateVector } from "@/lib/studio/queries";
import { routeError } from "@/lib/studio/route-error";
import { MAX_CLIP_BYTES } from "@/lib/studio/schemas";
import { deleteStudioFile, uploadStudioFile } from "@/lib/studio/storage";
import type { MovementEquipment } from "@/lib/studio/types";

const fieldsSchema = z.object({
  exercise_id: z.string().uuid(),
  avatar_id: z.string().uuid(),
  prompt: z.string().trim().max(4000).optional(),
  equipment: z.object({ items: z.array(z.record(z.unknown())).optional() }).passthrough().optional(),
  /** Where the clip comes from (deepmotion, saymotion, mixamo, ...), kept in `model`. */
  source: z.string().trim().max(120).optional(),
});

/**
 * A clip staff already have (a DeepMotion / SayMotion / Mixamo export, a keyframe json) as a new,
 * ready movement vector in one step: multipart `file` + `fields` (JSON: exercise_id, avatar_id,
 * prompt?, equipment?, source?). The row is created out of the worker's reach (not_before far
 * ahead) and released ready once the file is stored, so the pipeline never claims it.
 */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
    if (file.size > MAX_CLIP_BYTES) return NextResponse.json({ error: "clip larger than 100 MiB" }, { status: 400 });
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const kind = CLIP_EXTENSIONS[ext];
    if (!kind) return NextResponse.json({ error: "file must be .glb, .gltf, .fbx, .bvh or .json" }, { status: 400 });
    const fields = fieldsSchema.parse(JSON.parse(String(form.get("fields") ?? "{}")));

    const vector = await createVector(token, {
      exercise_id: fields.exercise_id,
      avatar_id: fields.avatar_id,
      prompt: fields.prompt?.trim() || `Uploaded clip: ${file.name}`,
      equipment: (fields.equipment ?? {}) as MovementEquipment,
      params: {},
      format: kind.format,
      not_before: "2999-01-01T00:00:00Z",
    });

    let uploadedId: string | null = null;
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const described = kind.format === "json" ? describeKeyframeJson(bytes.toString("utf8")) : null;
      const uploaded = await uploadStudioFile({
        token,
        bytes,
        mimeType: kind.mime,
        name: `clips/${vector.exercise_id}/${vector.id}.${ext}`,
      });
      uploadedId = uploaded.id;
      const updated = await updateVector(token, vector.id, {
        status: "ready",
        error: null,
        not_before: null,
        file_id: uploaded.id,
        vector_url: uploaded.url,
        format: kind.format,
        fps: described?.fps ?? null,
        frame_count: described?.frame_count ?? null,
        duration_ms: described?.duration_ms ?? null,
        model: fields.source?.trim() || "manual-upload",
      });
      return NextResponse.json({ vector: updated }, { status: 201 });
    } catch (error) {
      // Neither a zombie row nor an orphan file: undo both (best effort).
      await deleteVector(token, vector.id).catch(() => undefined);
      if (uploadedId) await deleteStudioFile(token, uploadedId);
      throw error;
    }
  } catch (error) {
    return routeError(error, "Failed to upload the clip");
  }
}
