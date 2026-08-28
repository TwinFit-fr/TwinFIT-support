import { NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/api-auth";
import { deactivateXcatExercise } from "@/lib/catalog";

export async function POST(request: Request) {
  try {
    requireAdminToken(request);
    const body = await request.json();
    const row = await deactivateXcatExercise(body);
    return NextResponse.json({ ok: true, ...row });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Deactivate failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
