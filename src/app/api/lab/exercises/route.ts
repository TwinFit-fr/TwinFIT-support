import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import {
  linkCatalogExercise,
  listCatalogCandidates,
  listLabExercises,
  updateLabExercise,
} from "@/lib/lab/queries";

const exoId = z.coerce.number({ error: "catalog_exo_id required" }).int().positive();

const linkSchema = z.object({ action: z.literal("link_catalog", { error: "Unknown action" }), catalog_exo_id: exoId });

/** `id` is the older name of `catalog_exo_id`. */
const patchSchema = z
  .object({
    catalog_exo_id: exoId.optional(),
    id: exoId.optional(),
    active: z.boolean().optional(),
    notes: z.string().max(5000).nullish(),
    sort_order: z.int().optional(),
  })
  .refine((body) => (body.catalog_exo_id ?? body.id) !== undefined, "catalog_exo_id required");

export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
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
    const token = await requireStaffToken(request);
    const body = await readJsonBody(request, linkSchema);
    const exercise = await linkCatalogExercise(token, body.catalog_exo_id);
    return NextResponse.json({ ok: true, exercise });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Lab exercise mutation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const body = await readJsonBody(request, patchSchema);
    const catalogExoId = (body.catalog_exo_id ?? body.id) as number;
    const exercise = await updateLabExercise(token, catalogExoId, {
      active: body.active,
      notes: body.notes,
      sort_order: body.sort_order,
    });
    return NextResponse.json({ ok: true, exercise });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
