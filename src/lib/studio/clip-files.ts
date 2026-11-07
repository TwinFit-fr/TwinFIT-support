import type { VectorFormat } from "./types";

/** Clip files staff attach or the pipeline writes: extension → stored format and MIME type. */
export const CLIP_EXTENSIONS: Record<string, { format: VectorFormat; mime: string }> = {
  glb: { format: "glb", mime: "model/gltf-binary" },
  gltf: { format: "gltf", mime: "model/gltf+json" },
  fbx: { format: "fbx", mime: "application/octet-stream" },
  bvh: { format: "bvh", mime: "text/plain" },
  json: { format: "json", mime: "application/json" },
};



/** What a keyframe json tells about itself, so the row carries fps / frames / duration without asking. */
export function describeKeyframeJson(text: string): { fps: number | null; frame_count: number | null; duration_ms: number | null } {
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
