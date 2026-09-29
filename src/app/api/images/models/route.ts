import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { capabilitiesFor } from "@/lib/images/capabilities";
import { listImageModelIds } from "@/lib/images/openai";

export async function GET(request: Request) {
  try {
    requireStaffToken(request);
    const models = await listImageModelIds();
    return NextResponse.json({
      models: models.map((id) => ({ id, capabilities: capabilitiesFor(id) })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list models" },
      { status: 500 },
    );
  }
}
