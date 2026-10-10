import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { getPilotData } from "@/lib/muscle-map/pilot";
import { errorResponse } from "@/lib/muscle-map/request";

/** Exercises with their resolved muscles, and option A's maps, for the B vs A comparison. */
export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    return NextResponse.json(await getPilotData(token));
  } catch (error) {
    return errorResponse(error, "Loading the exercises failed");
  }
}
