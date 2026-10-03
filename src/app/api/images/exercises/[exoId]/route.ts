import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { getImageExercise, setTwoFrames } from "@/lib/images/queries";

function parseExoId(raw: string): number | null {
  const exoId = Number(raw);
  return Number.isInteger(exoId) && exoId > 0 ? exoId : null;
}

export async function GET(request: Request, context: { params: Promise<{ exoId: string }> }) {
  try {
    const token = requireStaffToken(request);
    const exoId = parseExoId((await context.params).exoId);
    if (exoId == null) {
      return NextResponse.json({ error: "Invalid exo id" }, { status: 400 });
    }
    const styleId = z.string().uuid().parse(new URL(request.url).searchParams.get("style"));
    const exercise = await getImageExercise(token, exoId, styleId);
    if (!exercise) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }
    return NextResponse.json({ exercise });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "style query param (uuid) is required" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load exercise" },
      { status: 500 },
    );
  }
}

const patchSchema = z.object({ two_frames: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ exoId: string }> }) {
  try {
    const token = requireStaffToken(request);
    const exoId = parseExoId((await context.params).exoId);
    if (exoId == null) {
      return NextResponse.json({ error: "Invalid exo id" }, { status: 400 });
    }
    const styleId = z.string().uuid().parse(new URL(request.url).searchParams.get("style"));
    const { two_frames } = patchSchema.parse(await request.json());
    await setTwoFrames(token, exoId, two_frames);
    return NextResponse.json({ exercise: await getImageExercise(token, exoId, styleId) });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update exercise options" },
      { status: 500 },
    );
  }
}
