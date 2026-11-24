import { NextResponse } from "next/server";
import { callStaffFunction, getBearerToken, requireStaffToken } from "@/lib/api-auth";
import { hasAdminRole } from "@/lib/nhost/jwt";
import { parseSetRoleRequest, setRoleErrorMessage } from "@/lib/support/roles";
import type { AdminAction } from "@/lib/support/types";

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = (await request.json()) as AdminAction;

    switch (body.action) {
      case "verify-email": {
        const result = await callStaffFunction(token, "admin-verify-email", {
          userId: body.userId,
        });
        return NextResponse.json(result.body, { status: result.status });
      }
      case "grant-premium": {
        const result = await callStaffFunction(token, "admin-grant-premium", {
          userId: body.userId,
          reason: body.reason,
          endsAt: body.endsAt ?? null,
        });
        return NextResponse.json(result.body, { status: result.status });
      }
      case "revoke-premium": {
        const result = await callStaffFunction(token, "admin-grant-premium", {
          userId: body.userId,
          revoke: true,
        });
        return NextResponse.json(result.body, { status: result.status });
      }
      case "set-disabled": {
        const bearer = getBearerToken(request);
        if (!bearer || !hasAdminRole(bearer)) {
          return NextResponse.json({ error: "Admin role required" }, { status: 403 });
        }
        const result = await callStaffFunction(token, "admin-set-user-disabled", {
          userId: body.userId,
          disabled: body.disabled,
        });
        return NextResponse.json(result.body, { status: result.status });
      }
      case "set-role": {
        if (!hasAdminRole(token)) {
          return NextResponse.json(
            { error: setRoleErrorMessage(403, null) },
            { status: 403 },
          );
        }
        const parsed = parseSetRoleRequest(body);
        if (!parsed.ok) {
          return NextResponse.json({ error: parsed.error }, { status: 400 });
        }
        const result = await callStaffFunction(token, "admin-set-role", parsed.value);
        if (result.status < 200 || result.status >= 300) {
          return NextResponse.json(
            { error: setRoleErrorMessage(result.status, result.body) },
            { status: result.status },
          );
        }
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
