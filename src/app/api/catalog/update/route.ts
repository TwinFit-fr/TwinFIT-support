import { NextResponse } from "next/server";
import { callStaffFunction, requireStaffToken } from "@/lib/api-auth";

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = await request.json();
    const result = await callStaffFunction(token, "staff-catalog-update", body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
