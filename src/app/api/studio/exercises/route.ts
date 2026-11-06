import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { listStudioExercises } from "@/lib/studio/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const exercises = await listStudioExercises(token);
    return NextResponse.json({ exercises, count: exercises.length });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list exercises" },
      { status: 500 },
    );
  }
}
