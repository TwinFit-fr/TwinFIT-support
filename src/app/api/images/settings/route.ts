import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { MAX_CONCURRENCY_LIMIT, validateMaxConcurrency } from "@/lib/images/capabilities";
import { loadSettings, updateImageSettings } from "@/lib/images/queries";

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
  max_concurrency: z.number().int().min(1).max(MAX_CONCURRENCY_LIMIT),
});

export async function PUT(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = bodySchema.parse(await request.json());
    const concurrencyIssue = validateMaxConcurrency(body.max_concurrency);
    if (concurrencyIssue) {
      return NextResponse.json({ error: concurrencyIssue }, { status: 400 });
    }
    return NextResponse.json(await updateImageSettings(token, body));
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
