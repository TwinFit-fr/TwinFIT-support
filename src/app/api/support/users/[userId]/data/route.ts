import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { fetchUserSection } from "@/lib/support/queries";
import type { SupportUserSection } from "@/lib/support/types";

const SECTIONS = new Set<SupportUserSection>([
  "sessions",
  "templates",
  "routines",
  "custom",
]);

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const token = requireStaffToken(request);
    const { userId } = await context.params;
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section") as SupportUserSection | null;

    if (!section || !SECTIONS.has(section)) {
      return NextResponse.json(
        { error: "section must be one of sessions, templates, routines, custom" },
        { status: 400 },
      );
    }

    const data = await fetchUserSection(token, userId, section);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Failed to load section";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
