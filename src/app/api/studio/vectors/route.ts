import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { createVector, listVectors } from "@/lib/studio/queries";
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
      seed: z.number().int().optional(),
      model: z.string().max(120).optional(),
    })
    .passthrough()
    .default({}),
  format: z.enum(VECTOR_FORMATS as [string, ...string[]]).default("glb"),
});

/** The movement vectors of one exercise, newest first (`?exercise=<uuid>`). */
export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const exerciseId = z.string().uuid().parse(new URL(request.url).searchParams.get("exercise"));
    const vectors = await listVectors(token, exerciseId);
    return NextResponse.json({ vectors });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "exercise query param (uuid) is required" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list movement vectors" },
      { status: 500 },
    );
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
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to enqueue the generation" },
      { status: 500 },
    );
  }
}
