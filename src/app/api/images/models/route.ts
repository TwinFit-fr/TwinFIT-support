import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import {
  DEFAULT_GENERATION_PARAMS,
  GENERATION_PRESETS,
  listImageModelIds,
} from "@/lib/images/openai";

export async function GET(request: Request) {
  try {
    requireStaffToken(request);
    const models = await listImageModelIds();
    return NextResponse.json({
      models: models.map((id) => ({ id, label: id })),
      presets: GENERATION_PRESETS,
      defaults: DEFAULT_GENERATION_PARAMS,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list models" },
      { status: 500 },
    );
  }
}
