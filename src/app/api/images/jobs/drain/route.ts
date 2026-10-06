import { NextResponse, after } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { assetErrorResponse } from "@/lib/images/asset-request";
import { countPendingJobs, drainJobs } from "@/lib/images/jobs";

export const maxDuration = 300;

/** How many jobs wait or run, across every style. */
export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    return NextResponse.json(await countPendingJobs(token));
  } catch (error) {
    return assetErrorResponse(error, "Failed to count jobs", 500);
  }
}

/**
 * Processes queued jobs after responding. Called by a drain that ran out of time and by open
 * Images pages while jobs are pending; claims are atomic, so extra calls never duplicate work.
 */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const origin = new URL(request.url).origin;
    after(() => drainJobs(token, origin));
    return NextResponse.json({ status: "draining" }, { status: 202 });
  } catch (error) {
    return assetErrorResponse(error, "Failed to drain", 500);
  }
}
