import { NextResponse } from "next/server";
import { callStaffFunction, requireAdminToken } from "@/lib/api-auth";

/** Admin-only proxy to `admin-set-coach-token-limit`. Staff receives 403. */
export async function GET(request: Request) {
  try {
    const token = requireAdminToken(request);
    const result = await callStaffFunction(token, "admin-set-coach-token-limit", {});
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Could not load token limits";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = requireAdminToken(request);
    const body = (await request.json()) as {
      tierCode?: string;
      monthlyTokenLimit?: number | null;
      weeklyTokenLimit?: number | null;
      hourlyBurstLimit?: number | null;
    };
    // Each limit is an integer ≥ 0 or null (no cap); the Function checks the bounds. A limit left
    // undefined is dropped by JSON.stringify, so only the limits being set are sent.
    const result = await callStaffFunction(token, "admin-set-coach-token-limit", {
      tierCode: body.tierCode,
      monthlyTokenLimit: body.monthlyTokenLimit,
      weeklyTokenLimit: body.weeklyTokenLimit,
      hourlyBurstLimit: body.hourlyBurstLimit,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Could not save the token limit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
