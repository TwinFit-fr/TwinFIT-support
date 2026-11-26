import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { exerciseDetail, updateExercise, type ExercisePayload } from "@/lib/catalog";
import { friendlyCatalogError } from "@/lib/catalog/guard-rails";

/** `?exo_id=N`: the editor's extra data (custom reason, change history). */
export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const exoId = new URL(request.url).searchParams.get("exo_id");
    const data = await exerciseDetail(token, exoId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Exercise load failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const body = (await request.json()) as ExercisePayload;
    const exercise = await updateExercise(token, body);
    return NextResponse.json({ ok: true, exercise });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: friendlyCatalogError(message, "exercise") }, { status: 400 });
  }
}
