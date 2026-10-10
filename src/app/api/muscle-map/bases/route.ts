import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { imageSourceSchema, errorResponse, uploadOf, viewSchema } from "@/lib/muscle-map/request";
import { createBase } from "@/lib/muscle-map/service";

export const maxDuration = 300;

/** New base of a view (`?view=`): generated with the settings or uploaded; it becomes active. */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const view = viewSchema.parse(new URL(request.url).searchParams.get("view"));
    const upload = uploadOf(imageSourceSchema.parse(await request.json()));
    if (upload instanceof NextResponse) return upload;
    const base = await createBase(token, view, upload);
    return NextResponse.json({ base });
  } catch (error) {
    return errorResponse(error, "Base creation failed", 502);
  }
}
