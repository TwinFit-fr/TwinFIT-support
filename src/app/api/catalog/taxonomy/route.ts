import { NextResponse } from "next/server";
import { requireAdminToken, requireStaffToken } from "@/lib/api-auth";
import {
  fetchTaxonomy,
  manageRelation,
  setGroupMovementLabels,
  setPairMuscles,
  setPairStrengthPattern,
  updateLookup,
  upsertLookup,
} from "@/lib/catalog";
import { friendlyCatalogError, type CatalogErrorContext } from "@/lib/catalog/guard-rails";

/** Which taxonomy action failed, for the message when the database gives no detail. */
function errorContext(body: Record<string, unknown> | null): CatalogErrorContext {
  if (body?.kind === "relation") {
    const relation = body.relationKind ?? body.relation_kind;
    if (relation === "movement") return "movement";
    return body.action === "unlink" ? "unlink_muscle" : "link_muscle";
  }
  if (body?.kind === "pair_muscles" || body?.kind === "pair_strength_pattern") return "pair";
  if (body?.table === "catalog_muscles" && body?.muscle_group_code) return "link_muscle";
  return "lookup";
}

export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const data = await fetchTaxonomy(token);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Taxonomy load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown> | null = null;
  try {
    body = await request.json();
    if (!body) throw new Error("Request body required");
    const kind = body.kind as string | undefined;
    const action = body.action as string | undefined;

    if (kind === "relation" && action === "unlink") {
      const token = await requireAdminToken(request);
      await manageRelation(token, {
        action: body.action,
        kind: body.relationKind ?? body.relation_kind,
        muscle_group_code: body.muscle_group_code,
        code: body.code,
        role: body.role,
      });
      return NextResponse.json({ ok: true });
    }

    const token = await requireStaffToken(request);

    if (kind === "relation") {
      await manageRelation(token, {
        action: body.action,
        kind: body.relationKind ?? body.relation_kind,
        muscle_group_code: body.muscle_group_code,
        code: body.code,
        role: body.role,
      });
      return NextResponse.json({ ok: true });
    }
    if (kind === "group_movement_labels") {
      await setGroupMovementLabels(token, body);
      return NextResponse.json({ ok: true });
    }
    if (kind === "pair_muscles") {
      await setPairMuscles(token, body);
      return NextResponse.json({ ok: true });
    }
    if (kind === "pair_strength_pattern") {
      await setPairStrengthPattern(token, body);
      return NextResponse.json({ ok: true });
    }
    if (kind === "update") {
      const row = await updateLookup(token, body);
      return NextResponse.json({ ok: true, row });
    }
    const row = await upsertLookup(token, body);
    return NextResponse.json({ ok: true, row });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Taxonomy action failed";
    return NextResponse.json({ error: friendlyCatalogError(message, errorContext(body)) }, { status: 400 });
  }
}
