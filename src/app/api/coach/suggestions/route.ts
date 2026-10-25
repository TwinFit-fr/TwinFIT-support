import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import {
  ANSWER_MD_MAX,
  SUGGESTION_TEXT_MAX,
  createSuggestion,
  deleteSuggestion,
  deleteSuggestionLocalization,
  listSuggestions,
  updateSuggestion,
  upsertSuggestionLocalization,
} from "@/lib/coach";

function emptyToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const suggestions = await listSuggestions(token);
    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Failed to load suggestions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "create");

    if (action === "delete") {
      if (!body.id) throw new Error("id is required");
      await deleteSuggestion(token, String(body.id));
      return NextResponse.json({ ok: true });
    }

    if (action === "update") {
      if (!body.id) throw new Error("id is required");
      const suggestion = await updateSuggestion(token, String(body.id), {
        ...(body.slug !== undefined ? { slug: String(body.slug) } : {}),
        ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
        ...(body.requires_personal_data !== undefined
          ? { requires_personal_data: Boolean(body.requires_personal_data) }
          : {}),
        ...(body.requires_plan_builder !== undefined
          ? { requires_plan_builder: Boolean(body.requires_plan_builder) }
          : {}),
        ...(body.kind !== undefined ? { kind: String(body.kind) } : {}),
        ...(body.unlocks_after !== undefined ? { unlocks_after: emptyToNull(body.unlocks_after) } : {}),
        ...(body.section_slug !== undefined ? { section_slug: emptyToNull(body.section_slug) } : {}),
        ...(body.sort_order !== undefined ? { sort_order: Number(body.sort_order) } : {}),
      });
      return NextResponse.json({ suggestion });
    }

    if (action === "upsert_localization") {
      const suggestion_id = String(body.suggestion_id ?? "");
      const locale = String(body.locale ?? "");
      const text = String(body.text ?? "").trim();
      const answer_md = emptyToNull(body.answer_md);
      if (!suggestion_id || !locale) throw new Error("suggestion_id and locale are required");
      if (!text) throw new Error("text is required");
      if (text.length > SUGGESTION_TEXT_MAX) {
        throw new Error(`text must be ≤ ${SUGGESTION_TEXT_MAX} characters`);
      }
      if (answer_md && answer_md.length > ANSWER_MD_MAX) {
        throw new Error(`answer_md must be ≤ ${ANSWER_MD_MAX} characters`);
      }
      await upsertSuggestionLocalization(token, { suggestion_id, locale, text, answer_md });
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_localization") {
      const suggestion_id = String(body.suggestion_id ?? "");
      const locale = String(body.locale ?? "");
      if (!suggestion_id || !locale) throw new Error("suggestion_id and locale are required");
      if (locale === "en") throw new Error("The en localization cannot be deleted");
      await deleteSuggestionLocalization(token, suggestion_id, locale);
      return NextResponse.json({ ok: true });
    }

    const slug = String(body.slug ?? "").trim();
    const en_text = String(body.en_text ?? "").trim();
    const en_answer_md = emptyToNull(body.en_answer_md);
    if (!slug || !en_text) throw new Error("slug and en_text are required");
    if (en_text.length > SUGGESTION_TEXT_MAX) {
      throw new Error(`en_text must be ≤ ${SUGGESTION_TEXT_MAX} characters`);
    }
    if (en_answer_md && en_answer_md.length > ANSWER_MD_MAX) {
      throw new Error(`en_answer_md must be ≤ ${ANSWER_MD_MAX} characters`);
    }
    const suggestion = await createSuggestion(token, {
      slug,
      kind: String(body.kind ?? "prompt"),
      active: body.active !== false,
      requires_personal_data: Boolean(body.requires_personal_data),
      requires_plan_builder: Boolean(body.requires_plan_builder),
      unlocks_after: emptyToNull(body.unlocks_after),
      section_slug: emptyToNull(body.section_slug),
      sort_order: Number(body.sort_order ?? 0),
      en_text,
      en_answer_md,
    });
    return NextResponse.json({ suggestion });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Suggestion action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
