import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import {
  getActiveImageAtPosition,
  getExerciseImage,
  publishExerciseSequence,
} from "@/lib/images/queries";
import {
  LIVE_CHANGED_MESSAGE,
  liveFramesChanged,
  publishErrorMessage,
} from "@/lib/images/sequence";
import type { Subject } from "@/lib/images/types";

const bodySchema = z.object({
  startId: z.string().uuid(),
  midId: z.string().uuid().nullish(),
  endId: z.string().uuid(),
  /** The live frames the panel showed: publishing is refused when they are not live any more. */
  expectedLive: z.object({
    start: z.string().uuid().nullable(),
    mid: z.string().uuid().nullable(),
    end: z.string().uuid().nullable(),
  }),
});

/**
 * Publishes a sequence: the given Start, End and Mid (omitted for a two-frame exercise) become
 * the active, approved frames of their subject, in one transaction, and the subject's other
 * active frames are deactivated. The backend checks the frames (same sequence, Mid / End drawn on
 * this Start, Mid iff the exercise has three frames) and its error is returned as the message.
 */
export async function POST(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const { startId, midId, endId, expectedLive } = await readJsonBody(request, bodySchema);

    // Read the subject's live frames now: another tab may have published since the panel loaded.
    const start = await getExerciseImage(token, startId);
    if (!start) {
      return NextResponse.json({ error: publishErrorMessage("image_not_found") }, { status: 409 });
    }
    const subject = start.subject as Subject;
    const [liveStart, liveMid, liveEnd] = await Promise.all(
      [0, 1, 2].map((position) =>
        getActiveImageAtPosition(token, start.style_id, start.exo_id, subject, position),
      ),
    );
    if (
      liveFramesChanged(expectedLive, {
        start: liveStart?.id ?? null,
        mid: liveMid?.id ?? null,
        end: liveEnd?.id ?? null,
      })
    ) {
      return NextResponse.json({ error: LIVE_CHANGED_MESSAGE }, { status: 409 });
    }

    try {
      const images = await publishExerciseSequence(token, { startId, midId, endId });
      return NextResponse.json({ images });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Publish failed";
      const message = publishErrorMessage(raw, (id) =>
        id === startId ? "The Start" : id === midId ? "The Mid" : id === endId ? "The End" : null,
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
