import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { MAX_CONCURRENCY_LIMIT, validateGenerationParams } from "@/lib/images/capabilities";
import { listImagePrompts, loadSettings, updateImageSettings } from "@/lib/images/queries";
import { POSITION_PROMPT_KEYS } from "@/lib/images/types";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    return NextResponse.json(await loadSettings(token));
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 },
    );
  }
}

const bodySchema = z.object({
  params: z.object({
    model: z.string().min(1),
    shape: z.string().min(1),
    size: z.string().min(1),
    background: z.enum(["auto", "opaque", "transparent"]),
    background_color: z.string(),
    format: z.enum(["png", "webp", "jpeg"]),
    quality: z.string().min(1),
    compression: z.number().int().min(0).max(100),
    moderation: z.enum(["auto", "low"]),
    input_fidelity: z.enum(["high", "low"]),
    max_concurrency: z.number().int().min(1).max(MAX_CONCURRENCY_LIMIT),
    logo_in_exercises: z.boolean().default(false),
  }),
  system_prompt_id: z.string().uuid().nullable(),
  start_prompt_id: z.string().uuid().nullable(),
  mid_prompt_id: z.string().uuid().nullable(),
  end_prompt_id: z.string().uuid().nullable(),
});

export async function PUT(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = bodySchema.parse(await request.json());
    const issues = validateGenerationParams(body.params);

    const [prompts, current] = await Promise.all([listImagePrompts(token), loadSettings(token)]);
    const byId = new Map(prompts.map((p) => [p.id, p]));
    const system = body.system_prompt_id ? byId.get(body.system_prompt_id) : null;
    if (body.system_prompt_id && system?.kind !== "system") {
      issues.push("Selected system prompt does not exist.");
    }
    POSITION_PROMPT_KEYS.forEach((key, position) => {
      const id = body[key];
      const prompt = id ? byId.get(id) : null;
      if (id && (prompt?.kind !== "position" || prompt.position !== position)) {
        issues.push(`Selected prompt for position ${position} is not a position ${position} prompt.`);
      }
    });
    if (issues.length) {
      return NextResponse.json({ error: issues.join(" ") }, { status: 400 });
    }

    // The logo is only changed through /api/images/settings/logo; keep the stored one.
    return NextResponse.json(
      await updateImageSettings(token, {
        ...body,
        params: { ...body.params, logo_file_id: current.params.logo_file_id ?? null },
      }),
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings" },
      { status: 500 },
    );
  }
}
