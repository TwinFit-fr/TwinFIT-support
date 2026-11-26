import { NextResponse } from "next/server";
import { callStaffFunction, requireStaffAuth } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import { adminActionSchema } from "@/lib/support/actions";
import { setRoleErrorMessage } from "@/lib/support/roles";

export async function POST(request: Request) {
  try {
    const { token, role: callerRole } = await requireStaffAuth(request);
    const body = await readJsonBody(request, adminActionSchema);

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
          endsAt: body.endsAt,
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
        if (callerRole !== "admin") {
          return NextResponse.json({ error: "Admin role required" }, { status: 403 });
        }
        const result = await callStaffFunction(token, "admin-set-user-disabled", {
          userId: body.userId,
          disabled: body.disabled,
        });
        return NextResponse.json(result.body, { status: result.status });
      }
      case "set-role": {
        if (callerRole !== "admin") {
          return NextResponse.json(
            { error: setRoleErrorMessage(403, null) },
            { status: 403 },
          );
        }
        const { userId, role, granted } = body;
        const result = await callStaffFunction(token, "admin-set-role", { userId, role, granted });
        if (result.status < 200 || result.status >= 300) {
          return NextResponse.json(
            { error: setRoleErrorMessage(result.status, result.body) },
            { status: result.status },
          );
        }
        return NextResponse.json(result.body, { status: result.status });
      }
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
