import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import {
  deleteKnowledgeCard,
  deleteKnowledgeSource,
  embedKnowledgeCard,
  listKnowledgeCards,
  listKnowledgeSources,
  upsertKnowledgeCard,
  upsertKnowledgeSource,
} from "@/lib/coach";

function emptyToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function parseStringList(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const list = value.map((item) => String(item).trim()).filter(Boolean);
    return list.length ? list : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  return text
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const [sources, cards] = await Promise.all([
      listKnowledgeSources(token),
      listKnowledgeCards(token),
    ]);
    return NextResponse.json({ sources, cards });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Failed to load knowledge base";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "upsert_source") {
      const title = String(body.title ?? "").trim();
      if (!title) throw new Error("title is required");
      const source = await upsertKnowledgeSource(token, {
        id: body.id ? String(body.id) : undefined,
        kind: String(body.kind ?? "paper").trim() || "paper",
        title,
        authors: emptyToNull(body.authors),
        year: body.year == null || body.year === "" ? null : Number(body.year),
        doi: emptyToNull(body.doi),
        url: emptyToNull(body.url),
        license: emptyToNull(body.license),
      });
      return NextResponse.json({ source });
    }

    if (action === "delete_source") {
      if (!body.id) throw new Error("id is required");
      await deleteKnowledgeSource(token, String(body.id));
      return NextResponse.json({ ok: true });
    }

    if (action === "upsert_card") {
      const title = String(body.title ?? "").trim();
      if (!title) throw new Error("title is required");
      if (!body.source_id) throw new Error("source_id is required");
      const card = await upsertKnowledgeCard(token, {
        id: body.id ? String(body.id) : undefined,
        source_id: String(body.source_id),
        topic: emptyToNull(body.topic),
        locale: String(body.locale ?? "en"),
        title,
        summary_md: emptyToNull(body.summary_md),
        key_claims: parseStringList(body.key_claims),
        evidence_level: emptyToNull(body.evidence_level),
        population: emptyToNull(body.population),
        practical_takeaway: emptyToNull(body.practical_takeaway),
        caveats: emptyToNull(body.caveats),
        tags: parseStringList(body.tags),
        status: String(body.status ?? "draft"),
      });
      return NextResponse.json({ card });
    }

    if (action === "delete_card") {
      if (!body.id) throw new Error("id is required");
      await deleteKnowledgeCard(token, String(body.id));
      return NextResponse.json({ ok: true });
    }

    if (action === "embed_card") {
      if (!body.id) throw new Error("id is required");
      const result = await embedKnowledgeCard(token, String(body.id));
      return NextResponse.json({ result });
    }

    throw new Error(`Unknown action ${action}`);
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Knowledge action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
