import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { updateExercise, type ExercisePayload } from "@/lib/catalog";

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = (await request.json()) as ExercisePayload;
    const exercise = await updateExercise(token, body);
    return NextResponse.json({ ok: true, exercise });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
