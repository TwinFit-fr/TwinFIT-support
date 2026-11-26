import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import {
  createSuggestion,
  deleteSuggestion,
  deleteSuggestionLocalization,
  listSuggestions,
  updateSuggestion,
  upsertSuggestionLocalization,
} from "@/lib/coach";
import { suggestionActionSchema } from "@/lib/coach/request-schemas";

function emptyToNull(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
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
    const token = await requireStaffToken(request);
    const body = await readJsonBody(request, suggestionActionSchema);

    if (body.action === "delete") {
      await deleteSuggestion(token, body.id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "update") {
      const suggestion = await updateSuggestion(token, body.id, {
        ...(body.slug !== undefined ? { slug: body.slug } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.requires_personal_data !== undefined
          ? { requires_personal_data: body.requires_personal_data }
          : {}),
        ...(body.requires_plan_builder !== undefined
          ? { requires_plan_builder: body.requires_plan_builder }
          : {}),
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.unlocks_after !== undefined ? { unlocks_after: emptyToNull(body.unlocks_after) } : {}),
        ...(body.section_slug !== undefined ? { section_slug: emptyToNull(body.section_slug) } : {}),
        ...(body.sort_order !== undefined ? { sort_order: body.sort_order } : {}),
      });
      return NextResponse.json({ suggestion });
    }

    if (body.action === "upsert_localization") {
      const { suggestion_id, locale, text } = body;
      await upsertSuggestionLocalization(token, {
        suggestion_id,
        locale,
        text,
        answer_md: emptyToNull(body.answer_md),
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete_localization") {
      await deleteSuggestionLocalization(token, body.suggestion_id, body.locale);
      return NextResponse.json({ ok: true });
    }

    const suggestion = await createSuggestion(token, {
      slug: body.slug,
      kind: body.kind ?? "prompt",
      active: body.active !== false,
      requires_personal_data: body.requires_personal_data ?? false,
      requires_plan_builder: body.requires_plan_builder ?? false,
      unlocks_after: emptyToNull(body.unlocks_after),
      section_slug: emptyToNull(body.section_slug),
      sort_order: body.sort_order ?? 0,
      en_text: body.en_text,
      en_answer_md: emptyToNull(body.en_answer_md),
    });
    return NextResponse.json({ suggestion });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Suggestion action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
