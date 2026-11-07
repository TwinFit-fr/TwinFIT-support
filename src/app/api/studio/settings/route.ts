import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { getStudioSettings, updateStudioSettings } from "@/lib/studio/queries";
import { routeError } from "@/lib/studio/route-error";

const patchSchema = z
  .object({
    max_concurrency: z.number().int().min(1).max(8).optional(),
    stale_after_minutes: z.number().int().min(1).max(120).optional(),
    prompt_template: z.string().max(4000).optional(),
    /** Defaults copied into a generation's params when it gives none. */
    pipeline: z
      .object({
        fps: z.number().int().min(1).max(240).optional(),
        duration_s: z.number().min(0.5).max(60).optional(),
        loop: z.boolean().optional(),
        loop_mode: z.enum(["cycle", "pingpong"]).optional(),
        pose_count: z.number().int().min(2).max(6).optional(),
        model: z.string().trim().max(120).optional(),
      })
      .passthrough()
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nothing to update");

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    return NextResponse.json({ settings: await getStudioSettings(token) });
  } catch (error) {
    return routeError(error, "Failed to load settings");
  }
}

/** Staff edit of the workspace settings (one row): concurrency, stale limit, pipeline defaults, prompt template. */
export async function PATCH(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = patchSchema.parse(await request.json());
    return NextResponse.json({ settings: await updateStudioSettings(token, body) });
  } catch (error) {
    return routeError(error, "Failed to update settings");
  }
}
