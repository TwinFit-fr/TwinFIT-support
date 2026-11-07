import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { routeError } from "@/lib/studio/route-error";
import { getAvatar } from "@/lib/studio/queries";
import type { EquipmentItem } from "@/lib/studio/types";
import { draftExercisePoses } from "@/lib/studio/worker";

export const maxDuration = 120;

const bodySchema = z.object({
  exercise_id: z.string().uuid(),
  avatar_id: z.string().uuid(),
  items: z.array(z.record(z.unknown())).default([]),
  two_handed: z.boolean().default(false),
  instructions: z.string().trim().max(2000).nullable().optional(),
  pose_count: z.number().int().min(2).max(6).nullable().optional(),
});

/**
 * The AI draft of an exercise's key poses for the pose editor: from the catalog's pose texts and
 * frames, inside the joint ranges, with timing. Returns poses, labels, weights, loop mode, notes.
 */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = bodySchema.parse(await request.json());
    const avatar = await getAvatar(token, body.avatar_id);
    if (!avatar) return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    const draft = await draftExercisePoses(token, {
      exerciseId: body.exercise_id,
      subject: avatar.subject,
      avatarHeightM: avatar.height_m,
      items: body.items as EquipmentItem[],
      twoHanded: body.two_handed,
      instructions: body.instructions ?? null,
      poseCount: body.pose_count ?? null,
    });
    return NextResponse.json({ draft });
  } catch (error) {
    return routeError(error, "Could not draft the poses");
  }
}
