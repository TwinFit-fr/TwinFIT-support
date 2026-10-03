import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { validateGenerationParams } from "@/lib/images/capabilities";
import {
  deleteStyle,
  getStyle,
  listImagePrompts,
  updateStyle,
} from "@/lib/images/queries";
import { POSITION_PROMPT_KEYS } from "@/lib/images/types";

type Ctx = { params: Promise<{ styleId: string }> };

export async function GET(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId } = await context.params;
    const style = await getStyle(token, styleId);
    if (!style) return NextResponse.json({ error: "Style not found" }, { status: 404 });
    return NextResponse.json({ style });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load style" },
      { status: 500 },
    );
  }
}

const putSchema = z.object({
  name: z.string().min(1).max(120),
  published: z.boolean(),
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
  }),
  system_prompt_id: z.string().uuid().nullable(),
  start_prompt_id: z.string().uuid().nullable(),
  mid_prompt_id: z.string().uuid().nullable(),
  end_prompt_id: z.string().uuid().nullable(),
  support_prompt_id: z.string().uuid().nullable(),
  logo_in_exercises: z.boolean(),
});

export async function PUT(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId } = await context.params;
    const current = await getStyle(token, styleId);
    if (!current) return NextResponse.json({ error: "Style not found" }, { status: 404 });

    const body = putSchema.parse(await request.json());
    const issues = validateGenerationParams(body.params);
    const prompts = await listImagePrompts(token);
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
    if (body.support_prompt_id) {
      const support = byId.get(body.support_prompt_id);
      if (support?.kind !== "support") {
        issues.push("Selected support prompt does not exist.");
      }
    }
    if (issues.length) {
      return NextResponse.json({ error: issues.join(" ") }, { status: 400 });
    }

    const style = await updateStyle(token, styleId, {
      name: body.name,
      published: body.published,
      params: body.params,
      system_prompt_id: body.system_prompt_id,
      start_prompt_id: body.start_prompt_id,
      mid_prompt_id: body.mid_prompt_id,
      end_prompt_id: body.end_prompt_id,
      support_prompt_id: body.support_prompt_id,
      logo_in_exercises: body.logo_in_exercises,
      // Logo file is managed only by the logo endpoint.
      logo_file_id: current.logo_file_id,
    });
    return NextResponse.json({ style });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save style" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId } = await context.params;
    await deleteStyle(token, styleId);
    return NextResponse.json({ status: "deleted", id: styleId });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete style" },
      { status: 400 },
    );
  }
}
