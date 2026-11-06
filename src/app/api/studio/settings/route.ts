import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { getStudioSettings } from "@/lib/studio/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    return NextResponse.json({ settings: await getStudioSettings(token) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 },
    );
  }
}
