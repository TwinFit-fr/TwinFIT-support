import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { assetErrorResponse } from "@/lib/images/asset-request";
import { drainJobs, enqueueJobs, listJobs } from "@/lib/images/jobs";
import { MAX_RUN_REFERENCES } from "@/lib/images/types";

export const maxDuration = 300;

const promptText = z.string().trim().min(1).max(32000);
const referenceIds = z.array(z.string().uuid()).max(MAX_RUN_REFERENCES).optional();

const jobSpec = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("exercise_frame"),
    key: z.string().max(64).optional(),
    after: z.string().max(64).optional(),
    exoId: z.number().int().positive(),
    subject: z.enum(["man", "woman"]),
    position: z.number().int().min(0).max(2),
    options: z
      .object({
        systemOverride: promptText.optional(),
        positionOverride: promptText.optional(),
        referenceIds,
        skipInputs: z.array(z.enum(["character", "support", "logo"])).optional(),
        candidate: z.boolean().optional(),
      })
      .optional(),
  }),
  z.object({
    kind: z.literal("muscle_map"),
    target: z.object({ kind: z.enum(["muscle", "muscle_group"]), id: z.string().uuid() }),
    view: z.enum(["front", "back"]),
    options: z
      .object({
        promptOverride: promptText.optional(),
        referenceIds,
        candidate: z.boolean().optional(),
      })
      .optional(),
  }),
]);

const enqueueSchema = z.object({
  styleId: z.string().uuid(),
  jobs: z.array(jobSpec).min(1).max(500),
});

/** Jobs of a style (active and recently finished), optionally one kind or one exercise. */
export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const url = new URL(request.url);
    const styleId = z.string().uuid().parse(url.searchParams.get("style"));
    const kind = z
      .enum(["exercise_frame", "muscle_map"])
      .optional()
      .parse(url.searchParams.get("kind") ?? undefined);
    const exo = url.searchParams.get("exo");
    const jobs = await listJobs(token, {
      styleId,
      kind,
      exoId: exo ? z.coerce.number().int().positive().parse(exo) : undefined,
    });
    return NextResponse.json({ jobs });
  } catch (error) {
    return assetErrorResponse(error, "Failed to list jobs", 500);
  }
}

/** Enqueues a run and starts processing it on the server once the response is sent. */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const { styleId, jobs } = enqueueSchema.parse(await request.json());
    const result = await enqueueJobs(token, styleId, jobs);
    const origin = new URL(request.url).origin;
    after(() => drainJobs(token, origin));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return assetErrorResponse(error, "Failed to enqueue", 400);
  }
}
