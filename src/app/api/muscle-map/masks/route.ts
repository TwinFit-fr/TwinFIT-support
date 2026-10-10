import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { DEFAULT_ADJUST, UPLOAD_ADJUST, normalizeAdjust } from "@/lib/muscle-map/mask-ops";
import { errorResponse, imageSourceSchema, uploadOf } from "@/lib/muscle-map/request";
import { createMask } from "@/lib/muscle-map/service";

export const maxDuration = 300;

/**
 * New mask of a muscle (`?muscle_id=`) on the active base of its view; it becomes active.
 * Generated: the model paints the muscle in the key color and the mask is extracted. Uploaded:
 * a PNG whose alpha is the muscle. Optional `adjust` overrides the extraction defaults.
 */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const muscleId = z.string().uuid().parse(new URL(request.url).searchParams.get("muscle_id"));
    const raw = (await request.json()) as Record<string, unknown>;
    const upload = uploadOf(imageSourceSchema.parse(raw));
    if (upload instanceof NextResponse) return upload;
    const adjust = normalizeAdjust(raw.adjust, upload ? UPLOAD_ADJUST : DEFAULT_ADJUST);
    const mask = await createMask(token, { muscleId, adjust, upload });
    return NextResponse.json({ mask });
  } catch (error) {
    return errorResponse(error, "Mask creation failed", 502);
  }
}
