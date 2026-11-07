import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { createVector, listVectors } from "@/lib/studio/queries";
import { routeError } from "@/lib/studio/route-error";
import { VECTOR_FORMATS } from "@/lib/studio/types";

const equipmentItem = z.object({
  kind: z.enum(["load", "support"]),
  code: z.string().trim().min(1).max(64),
  socket: z.string().trim().min(1).max(64).optional(),
  socket_b: z.string().trim().min(1).max(64).optional(),
  count: z.number().int().min(1).max(20).optional(),
  weight_kg: z.number().min(0).max(1000).optional(),
  model_url: z.string().url().optional(),
});

const enqueueSchema = z.object({
  exercise_id: z.string().uuid(),
  avatar_id: z.string().uuid(),
  prompt: z.string().trim().min(1).max(4000),
  equipment: z.object({ items: z.array(equipmentItem).max(20).optional() }).passthrough(),
  params: z
    .object({
      fps: z.number().int().min(1).max(240).optional(),
      duration_s: z.number().min(0.5).max(60).optional(),
      loop: z.boolean().optional(),
      /** cycle | pingpong: how the poses loop; the model's choice when omitted. */
      loop_mode: z.enum(["cycle", "pingpong"]).optional(),
      /** How many key poses the model drafts (2–6); its choice when omitted. */
      pose_count: z.number().int().min(2).max(6).optional(),
      seed: z.number().int().optional(),
      /** The LLM that drafts the poses (default gpt-5-mini). */
      model: z.string().max(120).optional(),
    })
    .passthrough()
    .default({}),
  /** The pose pipeline writes json clips; other formats come from uploads. */
  format: z.enum(VECTOR_FORMATS as [string, ...string[]]).default("json"),
});

/** The movement vectors of one exercise, newest first (`?exercise=<uuid>`). */
export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const exerciseId = z.string().uuid().parse(new URL(request.url).searchParams.get("exercise"));
    const vectors = await listVectors(token, exerciseId);
    return NextResponse.json({ vectors });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "exercise query param (uuid) is required" }, { status: 400 });
    return routeError(error, "Failed to list movement vectors");
  }
}

/**
 * Enqueue a generation: inserts a `pending` movement vector with the staff JWT. The pipeline
 * worker claims it later through `animation_studio_claim_movement_vector`.
 */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const input = enqueueSchema.parse(await request.json());
    const vector = await createVector(token, {
      ...input,
      format: input.format as (typeof VECTOR_FORMATS)[number],
    });
    return NextResponse.json({ vector }, { status: 201 });
  } catch (error) {
    return routeError(error, "Failed to enqueue the generation");
  }
}
