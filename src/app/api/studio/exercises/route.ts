import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { routeError } from "@/lib/studio/route-error";
import { listStudioExercises } from "@/lib/studio/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const exercises = await listStudioExercises(token);
    return NextResponse.json({ exercises, count: exercises.length });
  } catch (error) {
    return routeError(error, "Failed to list exercises");
  }
}
