import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { updateAvatar } from "@/lib/studio/queries";
import { socketSchema } from "../route";

const patchSchema = z.object({
  sockets: z.array(socketSchema).max(32).optional(),
  height_m: z.number().min(0.5).max(2.5).nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

/** Edit an avatar: its sockets (the rig editor saves them here), height or name. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = requireStaffToken(request);
    const id = z.string().uuid().parse((await params).id);
    const body = patchSchema.parse(await request.json());
    if (body.sockets) {
      const ids = body.sockets.map((s) => s.id);
      if (new Set(ids).size !== ids.length) return NextResponse.json({ error: "socket ids must be unique" }, { status: 400 });
    }
    const avatar = await updateAvatar(token, id, body);
    return NextResponse.json({ avatar });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update the avatar" }, { status: 500 });
  }
}
