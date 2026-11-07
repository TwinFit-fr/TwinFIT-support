import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { activateVector, deleteVector, getVector, updateVector } from "@/lib/studio/queries";
import { routeError } from "@/lib/studio/route-error";
import { uuidSchema } from "@/lib/studio/schemas";
import { deleteStudioFile } from "@/lib/studio/storage";

const actionSchema = z.discriminatedUnion("action", [
  /** Make this ready clip the one the viewer plays for its exercise and avatar. */
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("deactivate") }),
  /** Put a failed row back in the queue. */
  z.object({ action: z.literal("requeue") }),
  /** Mark a queued or running row failed by hand (e.g. a worker that died without reporting). */
  z.object({ action: z.literal("fail"), error: z.string().trim().min(1).max(2000).default("Stopped by staff") }),
  /** Change the prompt of a row still in the queue. */
  z.object({ action: z.literal("edit"), prompt: z.string().trim().min(1).max(4000) }),
]);

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const token = requireStaffToken(request);
    const id = uuidSchema.parse((await params).id);
    const body = actionSchema.parse(await request.json());
    const current = await getVector(token, id);
    if (!current) return NextResponse.json({ error: "Movement vector not found" }, { status: 404 });

    let vector;
    switch (body.action) {
      case "activate":
        if (current.status !== "ready") {
          return NextResponse.json({ error: "Only a ready clip can be activated" }, { status: 409 });
        }
        vector = await activateVector(token, current);
        break;
      case "deactivate":
        vector = await updateVector(token, id, { active: false });
        break;
      case "requeue":
        if (current.status !== "error") {
          return NextResponse.json({ error: "Only a failed row goes back in the queue (stop a running one first)" }, { status: 409 });
        }
        vector = await updateVector(token, id, { status: "pending", error: null, not_before: null });
        break;
      case "fail":
        if (current.status === "ready") {
          return NextResponse.json({ error: "A ready clip cannot be marked failed" }, { status: 409 });
        }
        vector = await updateVector(token, id, { status: "error", error: body.error });
        break;
      case "edit":
        if (current.status !== "pending") {
          return NextResponse.json({ error: "Only a queued row's prompt can be edited" }, { status: 409 });
        }
        vector = await updateVector(token, id, { prompt: body.prompt });
        break;
    }
    return NextResponse.json({ vector });
  } catch (error) {
    return routeError(error, "Failed to update the movement vector");
  }
}

/** Removes a row that is not active (Hasura refuses active ones) nor running, and its clip file (best effort). */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const token = requireStaffToken(request);
    const id = uuidSchema.parse((await params).id);
    const current = await getVector(token, id);
    if (!current) return NextResponse.json({ error: "Movement vector not found" }, { status: 404 });
    if (current.status === "processing") {
      return NextResponse.json({ error: "The row is being generated: stop it first" }, { status: 409 });
    }
    const deleted = await deleteVector(token, id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found, or the clip is active: deactivate it first" }, { status: 409 });
    }
    const fileDeleted = deleted.file_id ? await deleteStudioFile(token, deleted.file_id) : true;
    return NextResponse.json({ deleted, file_deleted: fileDeleted });
  } catch (error) {
    return routeError(error, "Failed to delete the movement vector");
  }
}
