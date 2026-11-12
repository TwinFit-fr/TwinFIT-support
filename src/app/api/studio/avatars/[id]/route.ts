import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { retryStyledAvatar } from "@/lib/studio/avatar-service";
import { deleteAvatar, getAvatar, setDefaultAvatar, updateAvatar } from "@/lib/studio/queries";
import { routeError } from "@/lib/studio/route-error";
import { avatarHeightSchema, avatarNameSchema, socketsSchema, uuidSchema } from "@/lib/studio/schemas";
import { deleteStudioFile } from "@/lib/studio/storage";

const patchSchema = z.union([
  z.object({
    sockets: socketsSchema.optional(),
    height_m: avatarHeightSchema.nullable().optional(),
    name: avatarNameSchema.optional(),
  }),
  /** Make this ready avatar the default (the previous default is cleared in the same transaction). */
  z.object({ action: z.literal("set_default") }),
  /** Run a failed Meshy build again from its reference image. */
  z.object({ action: z.literal("retry") }),
]);

/** Edit an avatar: its sockets (the rig editor saves them here), height or name; set it as default; retry a failed build. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = requireStaffToken(request);
    const id = uuidSchema.parse((await params).id);
    const body = patchSchema.parse(await request.json());
    const current = await getAvatar(token, id);
    if (!current) return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    if ("action" in body) {
      if (body.action === "set_default") {
        if (current.status !== "ready") return NextResponse.json({ error: "Only a ready avatar can be the default" }, { status: 409 });
        return NextResponse.json({ avatar: await setDefaultAvatar(token, id) });
      }
      const avatar = await retryStyledAvatar(token, current);
      if (avatar.status === "error") return NextResponse.json({ error: avatar.error ?? "Meshy refused the task", avatar }, { status: 502 });
      return NextResponse.json({ avatar });
    }
    return NextResponse.json({ avatar: await updateAvatar(token, id, body) });
  } catch (error) {
    return routeError(error, "Failed to update the avatar");
  }
}

/** Remove an avatar and its file. Refused while movement vectors are authored for it (FK RESTRICT). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = requireStaffToken(request);
    const id = uuidSchema.parse((await params).id);
    const current = await getAvatar(token, id);
    if (!current) return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    if (current.status === "processing") return NextResponse.json({ error: "Wait for the build to finish or fail first" }, { status: 409 });
    let deleted;
    try {
      deleted = await deleteAvatar(token, id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/movement_vectors|foreign key/i.test(message)) {
        return NextResponse.json({ error: "This avatar has movement clips: delete them first" }, { status: 409 });
      }
      throw error;
    }
    if (!deleted) return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    if (deleted.file_id) await deleteStudioFile(token, deleted.file_id);
    return NextResponse.json({ deleted });
  } catch (error) {
    return routeError(error, "Failed to delete the avatar");
  }
}
