import { NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/api-auth";
import { updateXcatExercise } from "@/lib/catalog";

export async function POST(request: Request) {
  try {
    requireAdminToken(request);
    const body = await request.json();
    const exercise = await updateXcatExercise(body);
    return NextResponse.json({ ok: true, exercise });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
