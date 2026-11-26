import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import { assetErrorResponse } from "@/lib/images/asset-request";
import { cancelBatch, dismissBatch, drainJobs, retryBatch } from "@/lib/images/jobs";

export const maxDuration = 300;

type Ctx = { params: Promise<{ batchId: string }> };

const actionSchema = z.object({ action: z.enum(["retry", "cancel"]) });

/** retry: failed and skipped jobs run again; cancel: jobs not started yet are dropped. */
export async function POST(request: Request, context: Ctx) {
  try {
    const token = await requireStaffToken(request);
    const batchId = z
      .string()
      .uuid()
      .parse((await context.params).batchId);
    const { action } = await readJsonBody(request, actionSchema);
    if (action === "cancel") {
      return NextResponse.json({ cancelled: await cancelBatch(token, batchId) });
    }
    const retried = await retryBatch(token, batchId);
    if (retried) after(() => drainJobs(token));
    return NextResponse.json({ retried });
  } catch (error) {
    return assetErrorResponse(error, "Batch update failed", 400);
  }
}

/**
 * Dismisses a run's finished jobs (of one exercise with `?exo=`): they leave the list, the images
 * stay and the backend keeps the jobs with `dismissed_at`.
 */
export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = await requireStaffToken(request);
    const batchId = z
      .string()
      .uuid()
      .parse((await context.params).batchId);
    const exo = new URL(request.url).searchParams.get("exo");
    await dismissBatch(token, batchId, exo ? z.coerce.number().int().positive().parse(exo) : undefined);
    return NextResponse.json({ status: "dismissed" });
  } catch (error) {
    return assetErrorResponse(error, "Dismiss failed", 400);
  }
}
