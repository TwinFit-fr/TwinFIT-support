import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { listImageExercises } from "@/lib/images/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const styleId = z.string().uuid().parse(new URL(request.url).searchParams.get("style"));
    const exercises = await listImageExercises(token, styleId);
    return NextResponse.json({ exercises, count: exercises.length });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "style query param (uuid) is required" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list exercises" },
      { status: 500 },
    );
  }
}
