import { NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/api-auth";
import { deactivateExercise } from "@/lib/catalog";
import { friendlyCatalogError } from "@/lib/catalog/guard-rails";

export async function POST(request: Request) {
  try {
    const token = requireAdminToken(request);
    const body = await request.json();
    const row = await deactivateExercise(token, body);
    return NextResponse.json({ ok: true, ...row });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Deactivate failed";
    return NextResponse.json({ error: friendlyCatalogError(message, "deactivate") }, { status: 400 });
  }
}
