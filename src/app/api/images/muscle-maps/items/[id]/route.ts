import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { assetErrorResponse } from "@/lib/images/asset-request";
import {
  deleteMuscleMapImageRow,
  getMuscleMapImage,
  setMuscleMapActive,
} from "@/lib/images/muscle-maps";
import { deleteImageFile } from "@/lib/images/storage";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const { active } = patchSchema.parse(await request.json());
    const current = await getMuscleMapImage(token, id);
    if (!current) return NextResponse.json({ error: "Muscle map not found" }, { status: 404 });
    return NextResponse.json({ image: await setMuscleMapActive(token, current, active) });
  } catch (error) {
    return assetErrorResponse(error, "Update failed", 500);
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const current = await getMuscleMapImage(token, id);
    if (!current) return NextResponse.json({ error: "Muscle map not found" }, { status: 404 });
    if (current.active) {
      return NextResponse.json(
        { error: "Active maps cannot be deleted. Deactivate it first." },
        { status: 409 },
      );
    }
    await deleteMuscleMapImageRow(token, id);
    try {
      await deleteImageFile(token, current.file_id);
    } catch {
      /* row already gone; storage cleanup best-effort */
    }
    return NextResponse.json({ status: "deleted", id });
  } catch (error) {
    return assetErrorResponse(error, "Delete failed", 500);
  }
}
