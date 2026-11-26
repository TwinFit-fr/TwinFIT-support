import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import { listTierPolicies, updateTierCapabilities } from "@/lib/coach";
import { tierCapabilitiesSchema } from "@/lib/coach/request-schemas";

export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
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
    const token = await requireStaffToken(request);
    const body = await readJsonBody(request, tierCapabilitiesSchema);
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
