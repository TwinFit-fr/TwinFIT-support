import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import {
  activateEquipmentModel,
  deleteEquipmentModel,
  getEquipmentModel,
  updateEquipmentModel,
} from "@/lib/studio/queries";
import { deleteStudioFile } from "@/lib/studio/storage";

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("deactivate") }),
  z.object({
    action: z.literal("placement"),
    size_m: z.number().min(0.01).max(10),
    offset: vec3.optional(),
    rotation: vec3.optional(),
  }),
]);

/** activate (the model the viewer draws for its code) | deactivate | placement (size, offset, rotation). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = requireStaffToken(request);
    const id = z.string().uuid().parse((await params).id);
    const body = patchSchema.parse(await request.json());
    const model = await getEquipmentModel(token, id);
    if (!model) return NextResponse.json({ error: "Equipment model not found" }, { status: 404 });

    if (body.action === "activate") {
      if (model.status !== "ready") return NextResponse.json({ error: "Only a ready model can be used" }, { status: 409 });
      return NextResponse.json({ model: await activateEquipmentModel(token, model) });
    }
    if (body.action === "deactivate") {
      return NextResponse.json({ model: await updateEquipmentModel(token, id, { active: false }) });
    }
    const { size_m, offset, rotation } = body;
    const params_ = { ...model.params, size_m, ...(offset ? { offset } : {}), ...(rotation ? { rotation } : {}) };
    if (!offset) delete params_.offset;
    if (!rotation) delete params_.rotation;
    return NextResponse.json({ model: await updateEquipmentModel(token, id, { params: params_ }) });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "The action failed" }, { status: 500 });
  }
}

/** Remove a model that is not active; its files in 3d-workspace go with it (best effort). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = requireStaffToken(request);
    const id = z.string().uuid().parse((await params).id);
    const model = await getEquipmentModel(token, id);
    if (!model) return NextResponse.json({ error: "Equipment model not found" }, { status: 404 });
    if (model.active) return NextResponse.json({ error: "Stop using this model before deleting it" }, { status: 409 });
    const deleted = await deleteEquipmentModel(token, id);
    if (!deleted) return NextResponse.json({ error: "Equipment model not found" }, { status: 404 });
    await Promise.all([deleted.file_id, deleted.thumbnail_file_id].filter((f): f is string => Boolean(f)).map((f) => deleteStudioFile(token, f)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete the model" }, { status: 500 });
  }
}
