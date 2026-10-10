import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { getBoard } from "@/lib/muscle-map/queries";
import { errorResponse } from "@/lib/muscle-map/request";

/** Everything the muscle map prototype page shows: settings, muscles, bases and masks. */
export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    return NextResponse.json(await getBoard(token));
  } catch (error) {
    return errorResponse(error, "Muscle map load failed");
  }
}
