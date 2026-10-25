import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { uploadCoachMediaFile } from "@/lib/coach";

const bodySchema = z.object({
  mimeType: z.string().min(1),
  data: z.string().min(1),
  slug: z.string().min(1),
  locale: z.string().min(1),
  fileName: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const parsed = bodySchema.parse(await request.json());
    if (!parsed.mimeType.startsWith("image/")) {
      throw new Error("Only image uploads are allowed");
    }
    const bytes = Buffer.from(parsed.data, "base64");
    const safeName = (parsed.fileName || "image.png").replace(/[^a-zA-Z0-9._-]/g, "_");
    const name = `lessons/${parsed.slug}/${parsed.locale}/${Date.now()}-${safeName}`;
    const uploaded = await uploadCoachMediaFile({
      token,
      bytes,
      mimeType: parsed.mimeType,
      name,
    });
    return NextResponse.json({
      id: uploaded.id,
      url: uploaded.url,
      markdown: `![${safeName}](${uploaded.url})`,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
