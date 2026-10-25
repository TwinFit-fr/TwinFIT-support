import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { getPilotData } from "@/lib/muscle-map/pilot";
import { errorResponse } from "@/lib/muscle-map/request";

/** Active exercises with their resolved muscles, for the muscle map preview. */
export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    return NextResponse.json(await getPilotData(token));
  } catch (error) {
    return errorResponse(error, "Loading the exercises failed");
  }
}
