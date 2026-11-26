import { NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import { deactivateExercise } from "@/lib/catalog";
import { friendlyCatalogError } from "@/lib/catalog/guard-rails";
import { deactivateSchema } from "@/lib/catalog/request-schemas";

export async function POST(request: Request) {
  try {
    const token = await requireAdminToken(request);
    const body = await readJsonBody(request, deactivateSchema);
    const row = await deactivateExercise(token, body);
    return NextResponse.json({ ok: true, ...row });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Deactivate failed";
    return NextResponse.json({ error: friendlyCatalogError(message, "deactivate") }, { status: 400 });
  }
}
