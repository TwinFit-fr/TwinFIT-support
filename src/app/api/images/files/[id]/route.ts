import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { downloadImageFile } from "@/lib/images/storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const file = await downloadImageFile(token, id);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "File not found" },
      { status: 404 },
    );
  }
}
