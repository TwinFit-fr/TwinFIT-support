import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import {
  bindCatalogStaffToken,
  composeXcatExercise,
  listXcatLibraryAdmin,
  nextXcatExoId,
} from "@/lib/catalog";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    bindCatalogStaffToken(token);
    const { searchParams } = new URL(request.url);
    if (searchParams.get("nextExoId") === "1") {
      const exo_id = await nextXcatExoId();
      return NextResponse.json({ ok: true, exo_id });
    }
    const data = await listXcatLibraryAdmin();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Library load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    bindCatalogStaffToken(token);
    const body = await request.json();
    const exercise = await composeXcatExercise(body);
    return NextResponse.json({ ok: true, exercise });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Compose failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
