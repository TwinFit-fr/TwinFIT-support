import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { deleteMapMuscle, insertMapMuscle, updateMapMuscleView } from "@/lib/muscle-map/queries";
import { errorResponse, viewSchema } from "@/lib/muscle-map/request";

/** Paintable muscles: add one with its view, change its view (no masks yet), remove it. */

const muscleViewSchema = z.object({ muscle_id: z.string().uuid(), view: viewSchema });

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = muscleViewSchema.parse(await request.json());
    await insertMapMuscle(token, body.muscle_id, body.view);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Adding the muscle failed", 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = muscleViewSchema.parse(await request.json());
    await updateMapMuscleView(token, body.muscle_id, body.view);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Changing the view failed", 400);
  }
}

export async function DELETE(request: Request) {
  try {
    const token = requireStaffToken(request);
    const muscleId = z.string().uuid().parse(new URL(request.url).searchParams.get("muscle_id"));
    await deleteMapMuscle(token, muscleId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Removing the muscle failed", 400);
  }
}
