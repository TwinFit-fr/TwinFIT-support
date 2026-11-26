import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import {
  deleteCoachMediaFile,
  listCoachMediaFiles,
  renameCoachMediaFile,
  uploadCoachMediaFile,
} from "@/lib/coach";
import { isValidFolder, isValidObjectName, mediaObjectName, safeFileName } from "@/lib/coach/media";
import { COACH_MEDIA_MAX_BYTES } from "@/lib/coach/types";
import { IMAGE_MIME_TYPES } from "@/lib/images/asset-request";
import { imageUploadProblem, withImageExtension } from "@/lib/images/image-type";

/**
 * The coach-media library. Folders are name prefixes in the bucket (`lessons/{slug}/…`,
 * `prompts/{slug}/…`, `shared/…`); the public URL of a file is by id, so moving or renaming a
 * file never breaks an answer that embeds it.
 */

const folderSchema = z.string().refine(isValidFolder, "Folder must look like lessons/app_overview");

const uploadSchema = z.object({
  mimeType: IMAGE_MIME_TYPES,
  /** Base64 file content; base64 is 4/3 of the bytes, so longer strings are over the limit. */
  data: z
    .string()
    .min(1)
    .max(Math.ceil(COACH_MEDIA_MAX_BYTES / 3) * 4, `Image must be under ${COACH_MEDIA_MAX_BYTES / (1024 * 1024)} MB`),
  folder: folderSchema,
  fileName: z.string().min(1).optional(),
});

const renameSchema = z.object({
  id: z.string().uuid(),
  name: z.string().refine(isValidObjectName, "Name must look like lessons/app_overview/squat.png"),
});

const fileIdSchema = z.string().uuid();

function failure(error: unknown, fallback: string): Response {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Lists the bucket (`?prefix=lessons/app_overview` narrows to one folder subtree). */
export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const prefix = new URL(request.url).searchParams.get("prefix") ?? undefined;
    if (prefix !== undefined && !isValidFolder(prefix)) throw new Error("Invalid prefix");
    const files = await listCoachMediaFiles(token, prefix);
    return NextResponse.json({ files });
  } catch (error) {
    return failure(error, "Listing failed");
  }
}

/** Uploads one image into `folder`. */
export async function POST(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const parsed = uploadSchema.parse(await request.json());
    const bytes = Buffer.from(parsed.data, "base64");
    // PNG, WebP or JPEG only, checked on the bytes: an SVG or HTML file is refused whatever type
    // the client declares, and the stored name always carries the real extension.
    const problem = imageUploadProblem(bytes, parsed.mimeType, COACH_MEDIA_MAX_BYTES);
    if (problem) throw new Error(problem);
    const fileName = withImageExtension(safeFileName(parsed.fileName || "image").slice(0, 100), parsed.mimeType);
    const name = mediaObjectName(parsed.folder, fileName);
    const uploaded = await uploadCoachMediaFile({ token, bytes, mimeType: parsed.mimeType, name });
    return NextResponse.json({ id: uploaded.id, url: uploaded.url, name });
  } catch (error) {
    return failure(error, "Upload failed");
  }
}

/** Moves or renames a file (`{ id, name }`); its URL stays the same. */
export async function PATCH(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const parsed = renameSchema.parse(await request.json());
    const file = await renameCoachMediaFile(token, parsed.id, parsed.name);
    return NextResponse.json({ file });
  } catch (error) {
    return failure(error, "Rename failed");
  }
}

/**
 * Removes a coach-media file (`?id=<file id>`). With `&under=<folder>` the file is only removed
 * when it sits in that folder, so Save's orphan cleanup never deletes shared library images.
 */
export async function DELETE(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const params = new URL(request.url).searchParams;
    const id = fileIdSchema.parse(params.get("id"));
    const under = params.get("under") ?? undefined;
    if (under !== undefined && !isValidFolder(under)) throw new Error("Invalid folder");
    const result = await deleteCoachMediaFile(token, id, { underFolder: under });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failure(error, "Delete failed");
  }
}
