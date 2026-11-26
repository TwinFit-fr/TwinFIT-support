import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import { UPLOAD_BODY_MAX_BYTES } from "@/lib/images/asset-request";
import { imageSourceSchema, errorResponse, uploadOf, viewSchema } from "@/lib/muscle-map/request";
import { createBase } from "@/lib/muscle-map/service";

export const maxDuration = 300;

/** New base of a view (`?view=`): generated with the settings or uploaded; it becomes active. */
export async function POST(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const view = viewSchema.parse(new URL(request.url).searchParams.get("view"));
    const upload = uploadOf(await readJsonBody(request, imageSourceSchema, { maxBytes: UPLOAD_BODY_MAX_BYTES }));
    if (upload instanceof NextResponse) return upload;
    const base = await createBase(token, view, upload);
    return NextResponse.json({ base });
  } catch (error) {
    return errorResponse(error, "Base creation failed", 502);
  }
}
