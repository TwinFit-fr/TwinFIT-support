import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { getBase, setBaseActive } from "@/lib/muscle-map/queries";
import { errorResponse } from "@/lib/muscle-map/request";
import { deleteBase } from "@/lib/muscle-map/service";

type Ctx = { params: Promise<{ id: string }> };

/** Activate (the view's previous active base is deactivated) or deactivate a base. */
export async function PATCH(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const { active } = z.object({ active: z.boolean() }).parse(await request.json());
    const base = await getBase(token, id);
    if (!base) return NextResponse.json({ error: "Base not found" }, { status: 404 });
    await setBaseActive(token, base, active);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Base update failed", 400);
  }
}

/** Deletes an inactive base with its masks, then their files. */
export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const base = await getBase(token, id);
    if (!base) return NextResponse.json({ error: "Base not found" }, { status: 404 });
    await deleteBase(token, base);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Base deletion failed", 400);
  }
}
