import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { publishExerciseSequence } from "@/lib/images/queries";
import { publishErrorMessage } from "@/lib/images/sequence";

const bodySchema = z.object({
  startId: z.string().uuid(),
  midId: z.string().uuid().nullish(),
  endId: z.string().uuid(),
});

/**
 * Publishes a sequence: the given Start, End and Mid (omitted for a two-frame exercise) become
 * the active, approved frames of their subject, in one transaction, and the subject's other
 * active frames are deactivated. The backend checks the frames (same sequence, Mid / End drawn on
 * this Start, Mid iff the exercise has three frames) and its error is returned as the message.
 */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const { startId, midId, endId } = bodySchema.parse(await request.json());
    try {
      const images = await publishExerciseSequence(token, { startId, midId, endId });
      return NextResponse.json({ images });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Publish failed";
      const message = publishErrorMessage(raw, (id) =>
        id === midId ? "The Mid" : id === endId ? "The End" : null,
      );
      return NextResponse.json({ error: message }, { status: message === raw ? 502 : 409 });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Publish failed" },
      { status: 500 },
    );
  }
}
