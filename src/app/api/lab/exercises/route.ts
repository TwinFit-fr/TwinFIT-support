import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import {
  createRestExercise,
  linkCatalogExercise,
  listCatalogCandidates,
  listLabExercises,
  updateLabExercise,
} from "@/lib/lab/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const { searchParams } = new URL(request.url);
    if (searchParams.get("candidates") === "1") {
      const candidates = await listCatalogCandidates(token);
      return NextResponse.json({ ok: true, candidates });
    }
    const exercises = await listLabExercises(token);
    return NextResponse.json({ ok: true, exercises });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Failed to load lab exercises";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = await request.json();
    if (body.action === "link_catalog") {
      const exoId = Number(body.catalog_exo_id);
      if (!Number.isFinite(exoId)) {
        return NextResponse.json({ error: "catalog_exo_id required" }, { status: 400 });
      }
      const exercise = await linkCatalogExercise(token, exoId);
      return NextResponse.json({ ok: true, exercise });
    }
    if (body.action === "create_rest") {
      const displayName = String(body.display_name ?? "").trim();
      if (!displayName) {
        return NextResponse.json({ error: "display_name required" }, { status: 400 });
      }
      const exercise = await createRestExercise(token, {
        display_name: displayName,
        notes: body.notes ?? undefined,
        sort_order: body.sort_order ?? undefined,
        active: body.active ?? undefined,
      });
      return NextResponse.json({ ok: true, exercise });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Lab exercise mutation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = await request.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const exercise = await updateLabExercise(token, id, {
      active: body.active,
      notes: body.notes,
      sort_order: body.sort_order,
      display_name: body.display_name,
    });
    return NextResponse.json({ ok: true, exercise });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
