import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { assetErrorResponse } from "@/lib/images/asset-request";
import { listUsedMuscleMapSlots } from "@/lib/images/muscle-maps";

/** The view × crop pairs the active catalog has maps for (the bases a style needs). */
export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    return NextResponse.json({ slots: await listUsedMuscleMapSlots(token) });
  } catch (error) {
    return assetErrorResponse(error, "Failed to list muscle map slots", 500);
  }
}
