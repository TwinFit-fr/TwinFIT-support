import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { listTierPolicies, updateTierCapabilities } from "@/lib/coach";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const policies = await listTierPolicies(token);
    return NextResponse.json({ policies });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Failed to load tier policies";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = (await request.json()) as {
      tier_code?: string;
      personal_data_enabled?: boolean;
      plan_builder_enabled?: boolean;
      max_tool_rounds?: number;
    };
    if (!body.tier_code) throw new Error("tier_code is required");
    if (
      typeof body.personal_data_enabled !== "boolean" ||
      typeof body.plan_builder_enabled !== "boolean" ||
      typeof body.max_tool_rounds !== "number"
    ) {
      throw new Error("personal_data_enabled, plan_builder_enabled and max_tool_rounds are required");
    }
    if (!Number.isInteger(body.max_tool_rounds) || body.max_tool_rounds < 1 || body.max_tool_rounds > 8) {
      throw new Error("max_tool_rounds must be an integer from 1 to 8");
    }
    const policy = await updateTierCapabilities(token, body.tier_code, {
      personal_data_enabled: body.personal_data_enabled,
      plan_builder_enabled: body.plan_builder_enabled,
      max_tool_rounds: body.max_tool_rounds,
    });
    return NextResponse.json({ policy });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Tier update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
