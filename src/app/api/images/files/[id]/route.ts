import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { fileProxyHeaders, isStorageFileId, sniffImageType } from "@/lib/images/image-type";
import { downloadImageFile } from "@/lib/images/storage";

/**
 * Same-origin proxy of a Storage image (canvas reads, private buckets). It serves only PNG, WebP
 * and JPEG, typed from the bytes rather than Storage's Content-Type, so an uploaded SVG or HTML
 * file can never run on the Support origin.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const token = await requireStaffToken(request);
    const { id } = await context.params;
    if (!isStorageFileId(id)) {
      return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
    }
    const file = await downloadImageFile(token, id);
    const mimeType = sniffImageType(file.bytes);
    if (!mimeType) {
      return NextResponse.json(
        { error: "Only PNG, WebP and JPEG files are served" },
        { status: 415 },
      );
    }
    return new NextResponse(new Uint8Array(file.bytes), { headers: fileProxyHeaders(id, mimeType) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "File not found" },
      { status: 404 },
    );
  }
}
