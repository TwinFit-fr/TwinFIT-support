import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import {
  deleteExerciseImageRow,
  getExerciseImage,
  updateExerciseImage,
} from "@/lib/images/queries";
import { deleteImageFile } from "@/lib/images/storage";
import { isDeletableImage } from "@/lib/images/types";

const patchSchema = z
  .object({
    /** Only `false` (take the frame out of the app); activating is publishing a sequence. */
    active: z.boolean().optional(),
    review_status: z.enum(["pending", "approved", "rejected"]).optional(),
  })
  .refine((body) => body.active !== undefined || body.review_status !== undefined, {
    message: "Nothing to update",
  });

/**
 * Deactivates a frame and/or sets its review status. A frame is never activated here: that is
 * `POST /api/images/sequences` (the backend publishes Start, Mid and End together). A rejected
 * frame cannot be active, so rejecting an active frame deactivates it too.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    if (body.active === true) {
      return NextResponse.json(
        { error: "Frames are activated by publishing a sequence (Start, Mid and End together)" },
        { status: 409 },
      );
    }

    const current = await getExerciseImage(token, id);
    if (!current) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const deactivate = body.active === false || body.review_status === "rejected";
    const image = await updateExerciseImage(token, id, {
      ...(body.review_status ? { review_status: body.review_status } : {}),
      ...(deactivate && current.active ? { active: false, position: null } : {}),
    });
    return NextResponse.json({ image });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const current = await getExerciseImage(token, id);
    if (!current) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    if (!isDeletableImage(current)) {
      return NextResponse.json(
        { error: "Only images without a position can be deleted. Deactivate it first." },
        { status: 409 },
      );
    }

    await deleteExerciseImageRow(token, id);
    try {
      await deleteImageFile(token, current.file_id);
    } catch {
      /* row already gone; storage cleanup best-effort */
    }
    return NextResponse.json({ status: "deleted", id });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 },
    );
  }
}
