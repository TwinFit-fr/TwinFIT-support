import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { listMuscleMapBoard } from "@/lib/images/muscle-maps";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const styleId = z.string().uuid().parse(new URL(request.url).searchParams.get("style"));
    return NextResponse.json(await listMuscleMapBoard(token, styleId));
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "style query param (uuid) is required" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list muscle maps" },
      { status: 500 },
    );
  }
}
