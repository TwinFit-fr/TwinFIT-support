import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { downloadLabSetFile, isUuid } from "@/lib/lab/queries";

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\w.-]+/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid set id" }, { status: 400 });
    }

    const file = await downloadLabSetFile(token, id);
    return new NextResponse(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": contentDisposition(file.downloadName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Download failed";
    const status = message === "Set not found" || message === "Sensor file not found in Storage"
      ? 404
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
