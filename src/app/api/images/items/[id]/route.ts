import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import {
  clearActivePosition,
  deleteExerciseImageRow,
  getExerciseImage,
  updateExerciseImage,
} from "@/lib/images/queries";
import { deleteImageFile } from "@/lib/images/storage";
import { isDeletableImage } from "@/lib/images/types";

const patchSchema = z.object({
  position: z.number().int().min(0).nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const token = requireStaffToken(request);
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());

    const current = await getExerciseImage(token, id);
    if (!current) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    let nextActive = body.active ?? current.active;
    let nextPosition =
      body.position !== undefined ? body.position : current.position;

    // Deactivate always clears position.
    if (body.active === false || (nextActive === false && body.position === null)) {
      nextActive = false;
      nextPosition = null;
    }

    // Activate requires a position.
    if (nextActive && nextPosition == null) {
      return NextResponse.json(
        { error: "Active images require a position (0, 1, or 2)" },
        { status: 400 },
      );
    }

    if (nextActive && nextPosition != null) {
      await clearActivePosition(token, current.exo_id, nextPosition, id);
    }

    const image = await updateExerciseImage(token, id, {
      active: nextActive,
      position: nextPosition,
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
