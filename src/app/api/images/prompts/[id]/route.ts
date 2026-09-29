import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import {
  deleteImagePrompt,
  getImagePrompt,
  updateImagePrompt,
} from "@/lib/images/queries";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const prompt = await getImagePrompt(token, id);
    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }
    return NextResponse.json({ prompt });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load prompt" },
      { status: 500 },
    );
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  content: z.string().optional(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const body = updateSchema.parse(await request.json());
    const prompt = await updateImagePrompt(token, id, body);
    return NextResponse.json({ prompt });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save prompt" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    await deleteImagePrompt(token, id);
    return NextResponse.json({ status: "deleted", id });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete prompt" },
      { status: 400 },
    );
  }
}
