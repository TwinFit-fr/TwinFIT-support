import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { DEFAULT_GENERATION_PARAMS, validateGenerationParams } from "@/lib/images/capabilities";
import { updateSettings } from "@/lib/muscle-map/queries";
import { errorResponse } from "@/lib/muscle-map/request";

const paintColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, "Colors must be #RRGGBB or #RRGGBBAA");

const settingsSchema = z
  .object({
    target_color: paintColor,
    secondary_color: paintColor,
    key_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "The key color must be #RRGGBB"),
    generation: z.record(z.unknown()),
    base_prompt: z.string().max(32000),
    mask_prompt: z.string().max(32000),
  })
  .partial();

export async function PATCH(request: Request) {
  try {
    const token = requireStaffToken(request);
    const set = settingsSchema.parse(await request.json());
    if (set.generation) {
      const params = { ...DEFAULT_GENERATION_PARAMS, ...set.generation };
      const issues = validateGenerationParams(params);
      if (issues.length) return NextResponse.json({ error: issues.join(" ") }, { status: 400 });
      set.generation = params;
    }
    await updateSettings(token, set);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Settings update failed", 400);
  }
}
