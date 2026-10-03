import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { getStyle, updateStyle } from "@/lib/images/queries";
import { logoFileName } from "@/lib/images/reference";
import { deleteImageFile } from "@/lib/images/storage";
import { extensionForMime, replaceUploadedFile } from "@/lib/images/style-assets";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

type Ctx = { params: Promise<{ styleId: string }> };

const bodySchema = z.object({
  mimeType: z.enum(["image/png", "image/webp", "image/jpeg"]),
  data: z.string().min(1),
});

export async function POST(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId } = await context.params;
    const style = await getStyle(token, styleId);
    if (!style) return NextResponse.json({ error: "Style not found" }, { status: 404 });

    const { mimeType, data } = bodySchema.parse(await request.json());
    const bytes = Buffer.from(data, "base64");
    if (bytes.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Logo must be under 3 MB" }, { status: 400 });
    }
    const uploaded = await replaceUploadedFile({
      token,
      bytes,
      mimeType,
      name: logoFileName(style.code, extensionForMime(mimeType)),
      previousFileId: style.logo_file_id,
    });
    const updated = await updateStyle(token, styleId, { logo_file_id: uploaded.id });
    return NextResponse.json({ style: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Logo upload failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId } = await context.params;
    const style = await getStyle(token, styleId);
    if (!style) return NextResponse.json({ error: "Style not found" }, { status: 404 });
    const previous = style.logo_file_id;
    const updated = await updateStyle(token, styleId, { logo_file_id: null });
    if (previous) {
      try {
        await deleteImageFile(token, previous);
      } catch {
        /* best-effort */
      }
    }
    return NextResponse.json({ style: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Logo removal failed" },
      { status: 500 },
    );
  }
}
