import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { getImageExercise } from "@/lib/images/queries";

export async function GET(
  request: Request,
  context: { params: Promise<{ exoId: string }> },
) {
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
