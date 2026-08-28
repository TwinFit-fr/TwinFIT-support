import { NextResponse } from "next/server";
import { callAdminFunction, requireAdminToken } from "@/lib/api-auth";
import type { AdminAction } from "@/lib/support/types";

export async function POST(request: Request) {
  try {
    const token = requireAdminToken(request);
    const body = (await request.json()) as AdminAction;

    switch (body.action) {
      case "verify-email": {
        const result = await callAdminFunction(token, "admin-verify-email", {
          userId: body.userId,
        });
        return NextResponse.json(result.body, { status: result.status });
      }
      case "set-subscription": {
        const result = await callAdminFunction(token, "admin-set-subscription", {
          userId: body.userId,
          tier: body.tier,
          expiresAt: body.expiresAt ?? null,
          provider: body.provider ?? "manual",
          externalId: body.externalId ?? null,
        });
        return NextResponse.json(result.body, { status: result.status });
      }
      case "set-disabled": {
        const result = await callAdminFunction(token, "admin-set-user-disabled", {
          userId: body.userId,
          disabled: body.disabled,
        });
        return NextResponse.json(result.body, { status: result.status });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
