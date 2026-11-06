import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { activateVector, deleteVector, getVector, updateVector } from "@/lib/studio/queries";

const actionSchema = z.discriminatedUnion("action", [
  /** Make this ready clip the one the viewer plays for its exercise and avatar. */
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("deactivate") }),
  /** Put a failed (or stuck) row back in the queue. */
  z.object({ action: z.literal("requeue") }),
  /** Mark a row failed by hand (e.g. a worker that died without reporting). */
  z.object({ action: z.literal("fail"), error: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("edit"), prompt: z.string().trim().min(1).max(4000) }),
]);

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const token = requireStaffToken(request);
    const id = z.string().uuid().parse((await params).id);
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
        if (current.status === "ready") {
          return NextResponse.json({ error: "A ready clip is not requeued; enqueue a new generation" }, { status: 409 });
        }
        vector = await updateVector(token, id, { status: "pending", error: null, not_before: null });
        break;
      case "fail":
        vector = await updateVector(token, id, { status: "error", error: body.error });
        break;
      case "edit":
        vector = await updateVector(token, id, { prompt: body.prompt });
        break;
    }
    return NextResponse.json({ vector });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update the movement vector" },
      { status: 500 },
    );
  }
}

/** Removes a row that is not active (Hasura refuses active ones). The Storage file, if any, stays for now. */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const token = requireStaffToken(request);
    const id = z.string().uuid().parse((await params).id);
    const deleted = await deleteVector(token, id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found, or the clip is active: deactivate it first" }, { status: 409 });
    }
    return NextResponse.json({ deleted });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete the movement vector" },
      { status: 500 },
    );
  }
}
