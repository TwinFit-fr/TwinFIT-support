import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { getImageExercise, setTwoFrames } from "@/lib/images/queries";

export async function GET(request: Request, context: { params: Promise<{ exoId: string }> }) {
  try {
    const token = requireStaffToken(request);
    const { exoId: exoIdRaw } = await context.params;
    const exoId = Number(exoIdRaw);
    if (!Number.isFinite(exoId)) {
      return NextResponse.json({ error: "Invalid exo id" }, { status: 400 });
    }
    const exercise = await getImageExercise(token, exoId);
    if (!exercise) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }
    return NextResponse.json({ exercise });
  } catch (error) {
    if (error instanceof Response) return error;
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
    const exoId = Number((await context.params).exoId);
    if (!Number.isInteger(exoId) || exoId <= 0) {
      return NextResponse.json({ error: "Invalid exo id" }, { status: 400 });
    }
    const { two_frames } = patchSchema.parse(await request.json());
    await setTwoFrames(token, exoId, two_frames);
    return NextResponse.json({ exercise: await getImageExercise(token, exoId) });
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
