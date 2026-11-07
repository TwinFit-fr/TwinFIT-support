import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { listOrphanFiles } from "@/lib/studio/queries";
import { routeError } from "@/lib/studio/route-error";
import { deleteStudioFile } from "@/lib/studio/storage";

/** A file younger than this may belong to a row still being written: it is never swept. */
const GRACE_MS = 60 * 60 * 1000;

function sweepable(createdAt: string): boolean {
  return Date.now() - Date.parse(createdAt) > GRACE_MS;
}

/** Files of 3d-workspace no Studio row points at (replaced clips, aborted uploads). */
export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const orphans = await listOrphanFiles(token);
    return NextResponse.json({ orphans, sweepable: orphans.filter((f) => sweepable(f.createdAt)).length });
  } catch (error) {
    return routeError(error, "Failed to list the orphan files");
  }
}

/** Remove the orphans older than an hour. Returns what went and what could not. */
export async function DELETE(request: Request) {
  try {
    const token = requireStaffToken(request);
    const orphans = (await listOrphanFiles(token)).filter((f) => sweepable(f.createdAt));
    const results = await Promise.all(orphans.map(async (f) => ({ id: f.id, name: f.name, deleted: await deleteStudioFile(token, f.id) })));
    return NextResponse.json({ deleted: results.filter((r) => r.deleted).length, failed: results.filter((r) => !r.deleted) });
  } catch (error) {
    return routeError(error, "Failed to sweep the orphan files");
  }
}
