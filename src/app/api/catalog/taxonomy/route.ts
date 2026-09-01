import { NextResponse } from "next/server";
import { requireAdminToken, requireStaffToken } from "@/lib/api-auth";
import {
  bindCatalogStaffToken,
  fetchTaxonomyAdmin,
  manageRelation,
  updateLookup,
  upsertLookup,
} from "@/lib/catalog";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    bindCatalogStaffToken(token);
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
    const body = await request.json();
    const kind = body.kind as string | undefined;
    const action = body.action as string | undefined;

    if (kind === "relation" && action === "unlink") {
      const token = requireAdminToken(request);
      bindCatalogStaffToken(token);
      await manageRelation({
        action: body.action,
        kind: body.relationKind ?? body.relation_kind,
        muscle_group_code: body.muscle_group_code,
        code: body.code,
        role: body.role,
      });
      return NextResponse.json({ ok: true });
    }

    const token = requireStaffToken(request);
    bindCatalogStaffToken(token);

    if (kind === "relation") {
      await manageRelation({
        action: body.action,
        kind: body.relationKind ?? body.relation_kind,
        muscle_group_code: body.muscle_group_code,
        code: body.code,
        role: body.role,
      });
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
