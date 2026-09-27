import { NextResponse } from "next/server";
import { callStaffFunction, requireStaffToken } from "@/lib/api-auth";
import {
  bindCatalogStaffToken,
  resolveSupportEquipmentId,
  setExerciseSupportEquipment,
  upsertExerciseLocalizations,
} from "@/lib/catalog";

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = await request.json();
    const result = await callStaffFunction(token, "staff-catalog-update", body);
    if (result.status < 200 || result.status >= 300) {
      return NextResponse.json(result.body, { status: result.status });
    }

    bindCatalogStaffToken(token);
    const supportEquipmentId = await resolveSupportEquipmentId(body);
    await setExerciseSupportEquipment(body.exo_id, supportEquipmentId);
    if (body.localizations) {
      await upsertExerciseLocalizations(body.exo_id, body.localizations);
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
