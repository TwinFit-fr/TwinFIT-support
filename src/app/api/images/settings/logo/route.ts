import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { loadSettings, updateImageSettings } from "@/lib/images/queries";
import { logoFileName } from "@/lib/images/reference";
import { uploadImageFile } from "@/lib/images/storage";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

const bodySchema = z.object({
  mimeType: z.enum(["image/png", "image/webp", "image/jpeg"]),
  data: z.string().min(1),
});

/** Uploads a new brand logo and points settings at it. Previous files are kept (no delete). */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const { mimeType, data } = bodySchema.parse(await request.json());
    const bytes = Buffer.from(data, "base64");
    if (bytes.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Logo must be under 3 MB" }, { status: 400 });
    }
    const settings = await loadSettings(token);
    const uploaded = await uploadImageFile({
      token,
      bytes,
      mimeType,
      name: logoFileName(EXTENSION_BY_MIME[mimeType]),
    });
    return NextResponse.json(
      await updateImageSettings(token, {
        params: { ...settings.params, logo_file_id: uploaded.id },
      }),
    );
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
