import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { searchUsers } from "@/lib/support/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    if (!q || q.length < 4) {
      return NextResponse.json({ results: [] });
    }
    const results = await searchUsers(token, q, 10);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
