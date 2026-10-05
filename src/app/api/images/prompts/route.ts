import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { listImagePromptsForStyle } from "@/lib/images/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const styleId = new URL(request.url).searchParams.get("styleId");
    if (!styleId) {
      return NextResponse.json({ error: "styleId query parameter is required" }, { status: 400 });
    }
    const slots = await listImagePromptsForStyle(token, styleId);
    return NextResponse.json({ styleId, ...slots, prompts: Object.values(slots) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list prompts" },
      { status: 500 },
    );
  }
}
