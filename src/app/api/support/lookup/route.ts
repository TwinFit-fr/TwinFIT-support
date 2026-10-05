import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { lookupUser, lookupUserById, UUID_RE } from "@/lib/support/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    if (!q) {
      return NextResponse.json({ error: "q is required" }, { status: 400 });
    }
    const result = UUID_RE.test(q) ? await lookupUserById(token, q) : await lookupUser(token, q);
    if (!result) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
