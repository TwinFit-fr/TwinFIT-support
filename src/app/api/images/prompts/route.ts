import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import {
  createImagePrompt,
  listImagePrompts,
} from "@/lib/images/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const prompts = await listImagePrompts(token);
    return NextResponse.json({
      system: prompts.filter((p) => p.kind === "system"),
      position: prompts.filter((p) => p.kind === "position"),
      support: prompts.filter((p) => p.kind === "support"),
      prompts,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list prompts" },
      { status: 500 },
    );
  }
}

const createSchema = z.object({
  kind: z.enum(["system", "position", "support"]),
  position: z.number().int().min(0).max(2).optional().nullable(),
  name: z.string().min(1),
  content: z.string(),
});

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = createSchema.parse(await request.json());
    const prompt = await createImagePrompt(token, body);
    return NextResponse.json({ prompt });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create prompt" },
      { status: 500 },
    );
  }
}
