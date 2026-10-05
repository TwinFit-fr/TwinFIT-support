import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const IMAGE_MIME_TYPES = z.enum(["image/png", "image/webp", "image/jpeg"]);

/** Body of every style asset POST: generate with the style, or upload a file. */
export const assetBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({
    action: z.literal("upload"),
    mimeType: IMAGE_MIME_TYPES,
    data: z.string().min(1),
  }),
]);

export type AssetBody = z.infer<typeof assetBodySchema>;
export type AssetUpload = Extract<AssetBody, { action: "upload" }>;

/** Decoded upload bytes, or a 400 response when the file is too large. */
export function decodeAssetUpload(
  body: AssetUpload,
): { bytes: Buffer; mimeType: string } | NextResponse {
  const bytes = Buffer.from(body.data, "base64");
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image must be under 20 MB" }, { status: 400 });
  }
  return { bytes, mimeType: body.mimeType };
}

/** Shared catch block of the asset routes. */
export function assetErrorResponse(error: unknown, fallback: string, status = 502): Response {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.flatten() }, { status: 400 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status },
  );
}
