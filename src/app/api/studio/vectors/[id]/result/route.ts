import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { getVector, updateVector } from "@/lib/studio/queries";
import { uploadStudioFile } from "@/lib/studio/storage";
import type { VectorFormat } from "@/lib/studio/types";

const MAX_CLIP_BYTES = 100 * 1024 * 1024;

const EXTENSION: Record<string, { format: VectorFormat; mime: string }> = {
  glb: { format: "glb", mime: "model/gltf-binary" },
  gltf: { format: "gltf", mime: "model/gltf+json" },
  bvh: { format: "bvh", mime: "text/plain" },
  json: { format: "json", mime: "application/json" },
};

const metaSchema = z.object({
  fps: z.number().int().min(1).max(240).nullable().optional(),
  frame_count: z.number().int().positive().nullable().optional(),
  duration_ms: z.number().int().positive().nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
});

/** What a keyframe json tells about itself, so the row carries fps / frames / duration without asking. */
function describeKeyframeJson(text: string): { fps: number | null; frame_count: number | null; duration_ms: number | null } {
  try {
    const data = JSON.parse(text) as { fps?: unknown; duration?: unknown; tracks?: Record<string, unknown> };
    const fps = typeof data.fps === "number" ? Math.round(data.fps) : null;
    let end = typeof data.duration === "number" ? data.duration : 0;
    for (const track of Object.values(data.tracks ?? {})) {
      const rotation = Array.isArray(track) ? track : (track as { rotation?: unknown })?.rotation;
      if (Array.isArray(rotation)) {
        for (const key of rotation) if (Array.isArray(key) && typeof key[0] === "number") end = Math.max(end, key[0]);
      }
    }
    const duration_ms = end > 0 ? Math.round(end * 1000) : null;
    const frame_count = fps && duration_ms ? Math.round((duration_ms / 1000) * fps) : null;
    return { fps, frame_count, duration_ms };
  } catch {
    return { fps: null, frame_count: null, duration_ms: null };
  }
}

/**
 * Attach a finished clip to a movement vector by hand: multipart `file` (.glb / .gltf / .bvh /
 * .json) and optional `meta` (JSON: fps, frame_count, duration_ms, model). Uploads to
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
    const kind = EXTENSION[ext];
    if (!kind) return NextResponse.json({ error: "file must be .glb, .gltf, .bvh or .json" }, { status: 400 });
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
