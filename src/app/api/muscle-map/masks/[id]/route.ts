import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { DEFAULT_ADJUST, UPLOAD_ADJUST, normalizeAdjust } from "@/lib/muscle-map/mask-ops";
import { getBase, getMask, setMaskActive } from "@/lib/muscle-map/queries";
import { errorResponse } from "@/lib/muscle-map/request";
import { deleteMask, readjustMask } from "@/lib/muscle-map/service";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("adjust"), adjust: z.record(z.unknown()) }),
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("deactivate") }),
]);

/** Re-extract from the source with new adjustment settings, or (de)activate. */
export async function PATCH(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const mask = await getMask(token, id);
    if (!mask) return NextResponse.json({ error: "Mask not found" }, { status: 404 });
    if (body.action === "adjust") {
      const base = await getBase(token, mask.base_id);
      if (!base) return NextResponse.json({ error: "Base not found" }, { status: 404 });
      // Older masks miss newer fields (e.g. volume): those take the defaults.
      const defaults = mask.method === "uploaded" ? UPLOAD_ADJUST : DEFAULT_ADJUST;
      const adjust = normalizeAdjust(body.adjust, { ...defaults, ...mask.params.adjust });
      return NextResponse.json({ mask: await readjustMask(token, mask, base, adjust) });
    }
    await setMaskActive(token, mask, body.action === "activate");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Mask update failed", 400);
  }
}

/** Deletes an inactive mask, then its files. */
export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const mask = await getMask(token, id);
    if (!mask) return NextResponse.json({ error: "Mask not found" }, { status: 404 });
    await deleteMask(token, mask);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Mask deletion failed", 400);
  }
}
