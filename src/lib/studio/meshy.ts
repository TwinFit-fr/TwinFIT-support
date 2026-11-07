/**
 * Meshy image-to-3D client, server side only (the key never reaches the browser).
 * API: https://docs.meshy.ai/en/api/image-to-3d — create a task, poll it, download the GLB.
 */

import type { MeshyCredits } from "./types";

const BASE = "https://api.meshy.ai/openapi";
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

export type MeshyTaskStatus = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";

export type MeshyTask = {
  id: string;
  status: MeshyTaskStatus;
  progress: number;
  model_urls?: Partial<Record<"glb" | "fbx" | "obj" | "usdz", string>>;
  thumbnail_url?: string;
  task_error?: { message?: string } | null;
  consumed_credits?: number;
  created_at?: number;
  started_at?: number;
  finished_at?: number;
};

export type MeshyRequest = {
  /** Public URL or data URI of the reference image. */
  imageUrl: string;
  texturePrompt?: string;
  /** Scale to a real-world size on their side as well; the viewer re-measures anyway. */
  originAt: "bottom" | "center";
  /** Characters: ask for a rig-ready pose. */
  poseMode?: "t-pose" | "a-pose";
};

/** The request body sent for every equipment model; stored in params so a run can be repeated. */
export const MESHY_DEFAULTS = {
  ai_model: "latest",
  should_texture: true,
  enable_pbr: true,
  texture_resolution: "2k",
  should_remesh: true,
  topology: "triangle",
  target_polycount: 20000,
  target_formats: ["glb"],
  auto_size: true,
  image_enhancement: true,
} as const;

/**
 * A provider or configuration failure. `status` is what the Support route answers with: 502 for
 * anything Meshy itself refused or failed (its own status is kept in `upstreamStatus` for the
 * callers that care, e.g. 404 = task gone), 400 / 503 for problems on our side.
 */
export class MeshyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly upstreamStatus: number | null = null,
  ) {
    super(message);
    this.name = "MeshyError";
  }
}

/** The body of a response, stopping (and failing) as soon as it passes `max` bytes instead of buffering it all. */
export async function readCapped(res: Response, max: number, tooBig: string): Promise<Buffer> {
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > max) throw new MeshyError(tooBig, 400);
  if (!res.body) return Buffer.from(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new MeshyError(tooBig, 400);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function isMeshyConfigured(): boolean {
  return Boolean(process.env.MESHY_API_KEY);
}

function headers(): HeadersInit {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new MeshyError("MESHY_API_KEY is not configured", 500);
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function meshyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "message" in body && String((body as { message: unknown }).message)) ||
      `Meshy request failed (${res.status})`;
    throw new MeshyError(
      res.status === 402
        ? `Meshy: insufficient credits (${message})`
        : res.status === 429
          ? `Meshy: rate limited, try again in a moment`
          : res.status === 401 || res.status === 403
            ? `Meshy refused the API key (${message})`
            : `Meshy: ${message}`,
      502,
      res.status,
    );
  }
  return body as T;
}

/** Credits left on the account (free call). */
export async function getMeshyBalance(): Promise<MeshyCredits> {
  return meshyFetch<MeshyCredits>("/v1/balance");
}

/** Starts an image-to-3D task; returns its id. Costs credits once the task is accepted. */
export async function createImageTo3dTask(input: MeshyRequest): Promise<string> {
  const body = {
    ...MESHY_DEFAULTS,
    image_url: input.imageUrl,
    origin_at: input.originAt,
    ...(input.poseMode ? { pose_mode: input.poseMode } : {}),
    ...(input.texturePrompt ? { texture_prompt: input.texturePrompt.slice(0, 800) } : {}),
  };
  const res = await meshyFetch<{ result: string }>("/v1/image-to-3d", { method: "POST", body: JSON.stringify(body) });
  if (!res?.result) throw new MeshyError("Meshy returned no task id", 502);
  return res.result;
}

export async function getImageTo3dTask(id: string): Promise<MeshyTask> {
  return meshyFetch<MeshyTask>(`/v1/image-to-3d/${encodeURIComponent(id)}`);
}

/** Downloads a result file (GLB or thumbnail) from the signed URL Meshy gives. */
export async function downloadMeshyFile(url: string): Promise<{ bytes: Buffer; contentType: string | null }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new MeshyError(`Download failed (${res.status})`, 502, res.status);
  const bytes = await readCapped(res, MAX_DOWNLOAD_BYTES, "Result larger than 100 MiB");
  return { bytes, contentType: res.headers.get("content-type") };
}

/**
 * The reference image as a data URI. Meshy fetches public URLs itself, but a data URI works the
 * same for a local stack, a private bucket or an image staff pasted, so every request uses it.
 */
export async function imageUrlToDataUri(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new MeshyError(`Reference image download failed (${res.status})`, 502, res.status);
  const type = res.headers.get("content-type")?.split(";")[0] ?? "image/png";
  if (!/^image\/(png|jpe?g|webp)$/.test(type)) throw new MeshyError(`Reference image must be PNG, JPEG or WebP (got ${type})`, 400);
  const bytes = await readCapped(res, 20 * 1024 * 1024, "Reference image larger than 20 MB");
  return `data:${type};base64,${bytes.toString("base64")}`;
}

export type MeshyRiggingTask = MeshyTask & {
  result?: {
    rigged_character_glb_url?: string;
    rigged_character_fbx_url?: string;
    basic_animations?: Record<string, string>;
  };
};

/** Auto-rig a succeeded image-to-3D task (a humanoid facing +Z); returns the rigging task id. */
export async function createRiggingTask(input: { inputTaskId: string; heightMeters: number }): Promise<string> {
  const res = await meshyFetch<{ result: string }>("/v1/rigging", {
    method: "POST",
    body: JSON.stringify({ input_task_id: input.inputTaskId, height_meters: input.heightMeters }),
  });
  if (!res?.result) throw new MeshyError("Meshy returned no rigging task id", 502);
  return res.result;
}

export async function getRiggingTask(id: string): Promise<MeshyRiggingTask> {
  return meshyFetch<MeshyRiggingTask>(`/v1/rigging/${encodeURIComponent(id)}`);
}
