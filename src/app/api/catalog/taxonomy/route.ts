import { NextResponse } from "next/server";
import { requireStaffAuth, requireStaffToken } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import {
  fetchTaxonomy,
  manageRelation,
  setGroupMovementLabels,
  setPairMuscles,
  setPairStrengthPattern,
  updateLookup,
  upsertLookup,
} from "@/lib/catalog";
import { deletePairTargetProfile, setPairTargetProfile } from "@/lib/catalog/pair-profile-writes";
import { friendlyCatalogError, type CatalogErrorContext } from "@/lib/catalog/guard-rails";
import { taxonomyActionSchema, type TaxonomyAction } from "@/lib/catalog/request-schemas";

/** Which taxonomy action failed, for the message when the database gives no detail. */
function errorContext(body: TaxonomyAction | null): CatalogErrorContext {
  if (body?.kind === "relation") {
    const relation = body.relationKind ?? body.relation_kind;
    if (relation === "movement") return "movement";
    return body.action === "unlink" ? "unlink_muscle" : "link_muscle";
  }
  if (
    body?.kind === "pair_muscles" ||
    body?.kind === "pair_strength_pattern" ||
    body?.kind === "pair_target_profile" ||
    body?.kind === "pair_target_profile_delete"
  ) {
    return "pair";
  }
  if (body && (body.kind === undefined || body.kind === "upsert")) {
    if (body.table === "catalog_muscles" && body.muscle_group_code) return "link_muscle";
  }
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
  let body: TaxonomyAction | null = null;
  try {
    const { token, role } = await requireStaffAuth(request);
    body = await readJsonBody(request, taxonomyActionSchema);

    switch (body.kind) {
      case "relation": {
        // Unlinking a muscle or movement is admin only.
        if (body.action === "unlink" && role !== "admin") {
          return NextResponse.json({ error: "Admin role required" }, { status: 403 });
        }
        await manageRelation(token, {
          action: body.action,
          kind: body.relationKind ?? body.relation_kind,
          muscle_group_code: body.muscle_group_code,
          code: body.code,
          role: body.role,
        });
        return NextResponse.json({ ok: true });
      }
      case "group_movement_labels":
        await setGroupMovementLabels(token, body);
        return NextResponse.json({ ok: true });
      case "pair_muscles":
        await setPairMuscles(token, body);
        return NextResponse.json({ ok: true });
      case "pair_strength_pattern":
        await setPairStrengthPattern(token, body);
        return NextResponse.json({ ok: true });
      case "pair_target_profile":
        await setPairTargetProfile(token, body);
        return NextResponse.json({ ok: true });
      case "pair_target_profile_delete":
        await deletePairTargetProfile(token, body);
        return NextResponse.json({ ok: true });
      case "update": {
        const row = await updateLookup(token, body);
        return NextResponse.json({ ok: true, row });
      }
      default: {
        const row = await upsertLookup(token, body);
        return NextResponse.json({ ok: true, row });
      }
    }
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Taxonomy action failed";
    return NextResponse.json({ error: friendlyCatalogError(message, errorContext(body)) }, { status: 400 });
  }
}
