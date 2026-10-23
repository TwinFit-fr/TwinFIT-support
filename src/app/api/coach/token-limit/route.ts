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
      monthlyTokenLimit?: number;
      dailyBurstLimit?: number | null;
    };
    const result = await callStaffFunction(token, "admin-set-coach-token-limit", {
      tierCode: body.tierCode,
      monthlyTokenLimit: body.monthlyTokenLimit,
      dailyBurstLimit: body.dailyBurstLimit,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Could not save the token limit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
