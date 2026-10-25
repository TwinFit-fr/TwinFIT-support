import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { listToolNames, listTurnToolCalls } from "@/lib/coach";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const url = new URL(request.url);
    const tool = url.searchParams.get("tool") || undefined;
    const zero = url.searchParams.get("zero_result");
    const since = url.searchParams.get("since") || undefined;
    const until = url.searchParams.get("until") || undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 100;

    const [calls, tools] = await Promise.all([
      listTurnToolCalls(token, {
        tool,
        zero_result: zero === "true" ? true : zero === "false" ? false : undefined,
        since,
        until,
        limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100,
      }),
      listToolNames(token),
    ]);
    return NextResponse.json({ calls, tools });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Failed to load tool calls";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
