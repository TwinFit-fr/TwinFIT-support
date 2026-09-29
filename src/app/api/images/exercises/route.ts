import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { listImageExercises } from "@/lib/images/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const exercises = await listImageExercises(token);
    return NextResponse.json({ exercises, count: exercises.length });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list exercises" },
      { status: 500 },
    );
  }
}
