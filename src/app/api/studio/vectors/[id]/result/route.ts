import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { getVector, updateVector } from "@/lib/studio/queries";
import { CLIP_EXTENSIONS, describeKeyframeJson } from "@/lib/studio/clip-files";
import { routeError } from "@/lib/studio/route-error";
import { MAX_CLIP_BYTES, uuidSchema } from "@/lib/studio/schemas";
import { deleteStudioFile, uploadStudioFile } from "@/lib/studio/storage";

const metaSchema = z.object({
  fps: z.number().int().min(1).max(240).nullable().optional(),
  frame_count: z.number().int().positive().nullable().optional(),
  duration_ms: z.number().int().positive().nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
});

/**
 * Attach a finished clip to a movement vector by hand: multipart `file` (.glb / .gltf / .fbx /
 * .bvh / .json) and optional `meta` (JSON: fps, frame_count, duration_ms, model). Uploads to
 * 3d-workspace and marks the row ready; the clip it replaces is removed. Not while the pipeline
 * runs the row (stop it first).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = requireStaffToken(request);
    const id = uuidSchema.parse((await params).id);
    const vector = await getVector(token, id);
    if (!vector) return NextResponse.json({ error: "Movement vector not found" }, { status: 404 });
    if (vector.status === "processing") return NextResponse.json({ error: "The row is being generated: stop it first" }, { status: 409 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
    if (file.size > MAX_CLIP_BYTES) return NextResponse.json({ error: "clip larger than 100 MiB" }, { status: 400 });
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const kind = CLIP_EXTENSIONS[ext];
    if (!kind) return NextResponse.json({ error: "file must be .glb, .gltf, .fbx, .bvh or .json" }, { status: 400 });
    const meta = metaSchema.parse(JSON.parse(String(form.get("meta") ?? "{}")));

    const bytes = Buffer.from(await file.arrayBuffer());
    const described = kind.format === "json" ? describeKeyframeJson(bytes.toString("utf8")) : null;
    const uploaded = await uploadStudioFile({
      token,
      bytes,
      mimeType: kind.mime,
      name: `clips/${vector.exercise_id}/${vector.id}.${ext}`,
    });

    let updated;
    try {
      updated = await updateVector(token, id, {
        status: "ready",
        error: null,
        file_id: uploaded.id,
        vector_url: uploaded.url,
        format: kind.format,
        fps: meta.fps ?? described?.fps ?? vector.fps,
        frame_count: meta.frame_count ?? described?.frame_count ?? vector.frame_count,
        duration_ms: meta.duration_ms ?? described?.duration_ms ?? vector.duration_ms,
        model: meta.model ?? vector.model ?? "manual-upload",
      });
    } catch (error) {
      // The row still points at the old file: the new one would be an orphan.
      await deleteStudioFile(token, uploaded.id);
      throw error;
    }
    // The replaced file has no row pointing at it any more: drop it (best effort).
    if (vector.file_id && vector.file_id !== uploaded.id) await deleteStudioFile(token, vector.file_id);
    return NextResponse.json({ vector: updated }, { status: 201 });
  } catch (error) {
    return routeError(error, "Failed to attach the clip");
  }
}
