import { NextResponse } from "next/server";
import { z } from "zod";
import { decodeAssetUpload, IMAGE_MIME_TYPES } from "@/lib/images/asset-request";
import { MAP_VIEWS } from "./types";

/** Request bodies of the muscle map API routes. */

export const viewSchema = z.enum(MAP_VIEWS);

/** Generate with the settings, or upload a file (base64). */
export const imageSourceSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({ action: z.literal("upload"), mimeType: IMAGE_MIME_TYPES, data: z.string().min(1) }),
]);

/** Upload bytes of a body, null to generate, or a 400 response when the file is too large. */
export function uploadOf(
  body: z.infer<typeof imageSourceSchema>,
): { bytes: Buffer; mimeType: string } | null | NextResponse {
  return body.action === "upload" ? decodeAssetUpload(body) : null;
}

/** Shared catch block: thrown Responses pass through, bad bodies are 400s. */
export function errorResponse(error: unknown, fallback: string, status = 500): Response {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status },
  );
}
