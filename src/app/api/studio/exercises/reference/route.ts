import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { routeError } from "@/lib/studio/route-error";
import { getExerciseFrames, getExercisePoses } from "@/lib/studio/queries";

const querySchema = z.object({
  exo: z.coerce.number().int().positive(),
  subject: z.enum(["man", "woman"]).default("man"),
});

/**
 * The catalog reference of one exercise, read only: the position frames of the default style for
 * the avatar's subject and the position texts. The same two queries the AI draft reads.
 */
export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const params = new URL(request.url).searchParams;
    const query = querySchema.parse({ exo: params.get("exo"), subject: params.get("subject") ?? undefined });
    const [frames, poses] = await Promise.all([getExerciseFrames(token, query.exo, query.subject), getExercisePoses(token, query.exo)]);
    return NextResponse.json({ frames, poses });
  } catch (error) {
    return routeError(error, "Could not load the exercise reference");
  }
}
