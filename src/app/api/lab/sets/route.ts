import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import {
  LAB_SETS_PAGE_SIZE,
  listLabSetFilterOptions,
  listLabSets,
} from "@/lib/lab/queries";

function parseDateBound(value: string | null, endOfDay: boolean): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
}

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const { searchParams } = new URL(request.url);

    if (searchParams.get("options") === "1") {
      const options = await listLabSetFilterOptions(token);
      return NextResponse.json({ ok: true, options });
    }

    const page = Math.max(Number(searchParams.get("page") ?? 1) || 1, 1);
    const userParam = searchParams.get("user_id");
    const exoParam = searchParams.get("catalog_exo_id");
    const catalogExoId = exoParam ? Number(exoParam) : undefined;

    const result = await listLabSets(
      token,
      {
        userId: userParam === "deleted" ? null : userParam || undefined,
        catalogExoId:
          typeof catalogExoId === "number" && Number.isFinite(catalogExoId)
            ? catalogExoId
            : undefined,
        from: parseDateBound(searchParams.get("from"), false),
        to: parseDateBound(searchParams.get("to"), true),
      },
      page,
      LAB_SETS_PAGE_SIZE,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Failed to load lab sets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
