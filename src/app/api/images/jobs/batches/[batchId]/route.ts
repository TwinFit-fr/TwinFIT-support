import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { assetErrorResponse } from "@/lib/images/asset-request";
import { cancelBatch, dismissBatch, drainJobs, retryBatch } from "@/lib/images/jobs";

export const maxDuration = 300;

type Ctx = { params: Promise<{ batchId: string }> };

const actionSchema = z.object({ action: z.enum(["retry", "cancel"]) });

/** retry: failed and skipped jobs run again; cancel: jobs not started yet are dropped. */
export async function POST(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const batchId = z
      .string()
      .uuid()
      .parse((await context.params).batchId);
    const { action } = actionSchema.parse(await request.json());
    if (action === "cancel") {
      return NextResponse.json({ cancelled: await cancelBatch(token, batchId) });
    }
    const retried = await retryBatch(token, batchId);
    const origin = new URL(request.url).origin;
    if (retried) after(() => drainJobs(token, origin));
    return NextResponse.json({ retried });
  } catch (error) {
    return assetErrorResponse(error, "Batch update failed", 400);
  }
}

/** Clears a run's finished jobs from the list; the images stay. */
export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const batchId = z
      .string()
      .uuid()
      .parse((await context.params).batchId);
    return NextResponse.json({ dismissed: await dismissBatch(token, batchId) });
  } catch (error) {
    return assetErrorResponse(error, "Dismiss failed", 400);
  }
}
