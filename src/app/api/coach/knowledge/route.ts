import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import {
  deleteKnowledgeCard,
  deleteKnowledgeSource,
  embedKnowledgeCard,
  listKnowledgeCards,
  listKnowledgeSources,
  upsertKnowledgeCard,
  upsertKnowledgeSource,
} from "@/lib/coach";
import { knowledgeActionSchema } from "@/lib/coach/request-schemas";

function emptyToNull(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function parseStringList(value: string | string[] | null | undefined): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const list = value.map((item) => item.trim()).filter(Boolean);
    return list.length ? list : null;
  }
  const text = value.trim();
  if (!text) return null;
  return text
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
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
    const token = await requireStaffToken(request);
    const body = await readJsonBody(request, knowledgeActionSchema);

    if (body.action === "upsert_source") {
      const source = await upsertKnowledgeSource(token, {
        id: body.id,
        kind: body.kind || "paper",
        title: body.title,
        authors: emptyToNull(body.authors),
        year: body.year,
        doi: emptyToNull(body.doi),
        url: emptyToNull(body.url),
        license: emptyToNull(body.license),
      });
      return NextResponse.json({ source });
    }

    if (body.action === "upsert_card") {
      const card = await upsertKnowledgeCard(token, {
        id: body.id,
        source_id: body.source_id,
        topic: emptyToNull(body.topic),
        locale: body.locale || "en",
        title: body.title,
        summary_md: emptyToNull(body.summary_md),
        key_claims: parseStringList(body.key_claims),
        evidence_level: emptyToNull(body.evidence_level),
        population: emptyToNull(body.population),
        practical_takeaway: emptyToNull(body.practical_takeaway),
        caveats: emptyToNull(body.caveats),
        tags: parseStringList(body.tags),
        status: body.status ?? "draft",
      });
      return NextResponse.json({ card });
    }

    if (body.action === "delete_source") {
      await deleteKnowledgeSource(token, body.id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete_card") {
      await deleteKnowledgeCard(token, body.id);
      return NextResponse.json({ ok: true });
    }

    const result = await embedKnowledgeCard(token, body.id);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Knowledge action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
