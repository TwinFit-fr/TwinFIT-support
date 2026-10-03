import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { validateGenerationParams } from "@/lib/images/capabilities";
import { deleteStyle, getStyle, updateStyle } from "@/lib/images/queries";

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
  is_default: z.boolean(),
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
    if (issues.length) {
      return NextResponse.json({ error: issues.join(" ") }, { status: 400 });
    }

    const style = await updateStyle(token, styleId, {
      name: body.name,
      published: body.published,
      is_default: body.is_default,
      params: body.params,
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
      { status: 400 },
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
