import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import { friendlyCatalogError } from "@/lib/catalog/guard-rails";
import {
  addSearchSynonyms,
  deleteSearchSynonym,
  fetchSearchSynonyms,
} from "@/lib/catalog/search-synonym-operations";
import { searchSynonymActionSchema } from "@/lib/catalog/search-synonym-schemas";

export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const data = await fetchSearchSynonyms(token);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Search synonyms load failed";
    return NextResponse.json({ error: friendlyCatalogError(message, "synonym") }, { status: 500 });
  }
}

/** Staff add a phrase for one or more codes, or delete one row by its full key. */
export async function POST(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const body = await readJsonBody(request, searchSynonymActionSchema);
    if (body.action === "delete") {
      const deleted = await deleteSearchSynonym(token, body);
      return NextResponse.json({ ok: true, deleted });
    }
    const result = await addSearchSynonyms(token, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Search synonym action failed";
    return NextResponse.json({ error: friendlyCatalogError(message, "synonym") }, { status: 400 });
  }
}
