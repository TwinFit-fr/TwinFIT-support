import { NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/api-auth";
import {
  fetchTaxonomyAdmin,
  manageRelation,
  updateLookup,
  upsertLookup,
} from "@/lib/catalog";

export async function GET(request: Request) {
  try {
    requireAdminToken(request);
    const data = await fetchTaxonomyAdmin();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Taxonomy load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requireAdminToken(request);
    const body = await request.json();
    const kind = body.kind as string | undefined;

    if (kind === "relation") {
      await manageRelation(body);
      return NextResponse.json({ ok: true });
    }
    if (kind === "update") {
      const row = await updateLookup(body);
      return NextResponse.json({ ok: true, row });
    }
    const row = await upsertLookup(body);
    return NextResponse.json({ ok: true, row });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Taxonomy action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
