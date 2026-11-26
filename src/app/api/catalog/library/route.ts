import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { composeExercise, listLibrary, type ExercisePayload } from "@/lib/catalog";
import { friendlyCatalogError } from "@/lib/catalog/guard-rails";

export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const data = await listLibrary(token);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Library load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const body = (await request.json()) as ExercisePayload;
    const exercise = await composeExercise(token, body);
    return NextResponse.json({ ok: true, exercise });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Compose failed";
    return NextResponse.json({ error: friendlyCatalogError(message, "exercise") }, { status: 400 });
  }
}
