import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { createStyle, listStyles } from "@/lib/images/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const styles = await listStyles(token);
    return NextResponse.json({ styles });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list styles" },
      { status: 500 },
    );
  }
}

const createSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  copyFromStyleId: z.string().uuid().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = createSchema.parse(await request.json());
    const style = await createStyle(token, body);
    return NextResponse.json({ style });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create style" },
      { status: 400 },
    );
  }
}
