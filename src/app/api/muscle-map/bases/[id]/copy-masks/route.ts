import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { getBase } from "@/lib/muscle-map/queries";
import { errorResponse } from "@/lib/muscle-map/request";
import { copyMasks } from "@/lib/muscle-map/service";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** Copies the active masks of `from_base_id` onto this base (same view and size). */
export async function POST(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const { from_base_id } = z.object({ from_base_id: z.string().uuid() }).parse(await request.json());
    const [to, from] = await Promise.all([getBase(token, id), getBase(token, from_base_id)]);
    if (!to || !from) return NextResponse.json({ error: "Base not found" }, { status: 404 });
    return NextResponse.json(await copyMasks(token, from, to));
  } catch (error) {
    return errorResponse(error, "Copying masks failed", 400);
  }
}
