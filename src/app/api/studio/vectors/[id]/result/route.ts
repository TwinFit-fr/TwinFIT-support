import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { getVector, updateVector } from "@/lib/studio/queries";
import { CLIP_EXTENSIONS, describeKeyframeJson } from "@/lib/studio/clip-files";
import { deleteStudioFile, uploadStudioFile } from "@/lib/studio/storage";

const MAX_CLIP_BYTES = 100 * 1024 * 1024;

const metaSchema = z.object({
  fps: z.number().int().min(1).max(240).nullable().optional(),
  frame_count: z.number().int().positive().nullable().optional(),
  duration_ms: z.number().int().positive().nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
});

/**
 * Attach a finished clip to a movement vector by hand: multipart `file` (.glb / .gltf / .fbx /
 * .bvh / .json) and optional `meta` (JSON: fps, frame_count, duration_ms, model). Uploads to
 * 3d-workspace and marks the row ready. This is what the pipeline does at the end of a run;
 * here it lets staff review a clip produced elsewhere.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = requireStaffToken(request);
    const id = z.string().uuid().parse((await params).id);
    const vector = await getVector(token, id);
    if (!vector) return NextResponse.json({ error: "Movement vector not found" }, { status: 404 });

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

    const updated = await updateVector(token, id, {
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
    // The replaced file has no row pointing at it any more: drop it (best effort).
    if (vector.file_id && vector.file_id !== uploaded.id) await deleteStudioFile(token, vector.file_id);
    return NextResponse.json({ vector: updated }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to attach the clip" },
      { status: 500 },
    );
  }
}
