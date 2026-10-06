import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { assetErrorResponse } from "@/lib/images/asset-request";
import { listPromptVersions } from "@/lib/images/prompt-versions";

/** Every saved text of a prompt slot, newest first. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const token = requireStaffToken(request);
    const id = z
      .string()
      .uuid()
      .parse((await context.params).id);
    return NextResponse.json({ versions: await listPromptVersions(token, id) });
  } catch (error) {
    return assetErrorResponse(error, "Failed to load prompt history", 500);
  }
}
