import { NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/api-auth";
import { bindCatalogStaffToken, deactivateXcatExercise } from "@/lib/catalog";

export async function POST(request: Request) {
  try {
    const token = requireAdminToken(request);
    bindCatalogStaffToken(token);
    const body = await request.json();
    const row = await deactivateXcatExercise(body);
    return NextResponse.json({ ok: true, ...row });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Deactivate failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
