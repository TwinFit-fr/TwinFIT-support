import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  changedLocales,
  draftFromSuggestion,
  isDirty,
  localeStatus,
  planSave,
  storageFileId,
  urlReferencedElsewhere,
  validateDraft,
  type LessonDraft,
} from "./lesson-draft.ts";
import type { Suggestion } from "./types.ts";

const suggestion: Suggestion = {
  id: "s1",
  slug: "app_overview",
  active: true,
  requires_personal_data: false,
  requires_plan_builder: false,
  kind: "lesson",
  unlocks_after: null,
  section_slug: "start",
  sort_order: 10,
  created_at: "",
  updated_at: "",
  localizations: [
    { suggestion_id: "s1", locale: "en", text: "Overview", answer_md: "# Hi\n\n![a](https://h/v1/files/11111111-1111-4111-8111-111111111111)" },
    { suggestion_id: "s1", locale: "es", text: "Resumen", answer_md: null },
  ],
};

const base = draftFromSuggestion(suggestion);
const withEn = (draft: LessonDraft, patch: Partial<{ text: string; answer_md: string }>): LessonDraft => ({
  ...draft,
  localizations: { ...draft.localizations, en: { ...draft.localizations.en!, ...patch } },
});

describe("draft state", () => {
  it("starts clean and reports which locales changed", () => {
    assert.equal(isDirty(base, base), false);
    const edited = withEn(base, { text: "Overview 2" });
    assert.equal(isDirty(base, edited), true);
    assert.deepEqual(changedLocales(base, edited), ["en"]);
  });

  it("ignores whitespace-only differences in the answer", () => {
    assert.equal(isDirty(base, withEn(base, { answer_md: base.localizations.en!.answer_md + "\n\n" })), false);
  });

  it("treats a removed locale as a change", () => {
    const { es: _es, ...rest } = base.localizations;
    assert.deepEqual(changedLocales(base, { ...base, localizations: rest }), ["es"]);
  });

  it("grades locale completeness", () => {
    assert.equal(localeStatus(base, "en"), "complete");
    assert.equal(localeStatus(base, "es"), "no-answer");
    assert.equal(localeStatus(base, "fr"), "missing");
  });

  it("blocks Save on empty text, limits and a missing en", () => {
    assert.deepEqual(validateDraft(base), []);
    assert.equal(validateDraft(withEn(base, { text: " " })).length, 1);
    assert.equal(validateDraft(withEn(base, { text: "x".repeat(121) })).length, 1);
    assert.equal(validateDraft(withEn(base, { answer_md: "x".repeat(16001) })).length, 1);
    const { en: _en, ...rest } = base.localizations;
    assert.equal(validateDraft({ ...base, localizations: rest })[0].locale, "en");
  });
});

describe("planSave", () => {
  it("is empty for a clean draft", () => {
    assert.deepEqual(planSave(base, base), { steps: [], uploads: [], droppedUrls: [], summary: [] });
  });

  it("writes flags, upserts changed locales, deletes removed ones and lists pending uploads", () => {
    const { es: _es, ...rest } = base.localizations;
    const draft: LessonDraft = {
      ...base,
      active: false,
      localizations: {
        ...rest,
        en: { text: "Overview", answer_md: "![new](pending:p1)" },
        fr: { text: "Aperçu", answer_md: "" },
      },
    };
    const plan = planSave(base, draft);
    assert.deepEqual(
      plan.steps.map((s) => s.kind),
      ["update_meta", "upsert_localization", "delete_localization", "upsert_localization"],
    );
    assert.deepEqual(plan.uploads, ["p1"]);
    assert.deepEqual(plan.droppedUrls, ["https://h/v1/files/11111111-1111-4111-8111-111111111111"]);
    assert.deepEqual(plan.summary, ["flags", "en", "es (remove)", "fr"]);
    const fr = plan.steps[3];
    assert.equal(fr.kind === "upsert_localization" && fr.answer_md, null);
  });
});

describe("storage helpers", () => {
  it("extracts a file id only from storage URLs", () => {
    assert.equal(
      storageFileId("https://x.storage.eu.nhost.run/v1/files/11111111-1111-4111-8111-111111111111"),
      "11111111-1111-4111-8111-111111111111",
    );
    assert.equal(storageFileId("https://example.com/a.png"), null);
  });

  it("finds a URL used by another suggestion", () => {
    const url = "https://h/v1/files/11111111-1111-4111-8111-111111111111";
    const other: Suggestion = { ...suggestion, id: "s2", slug: "other" };
    assert.equal(urlReferencedElsewhere([suggestion], "s1", url), false);
    assert.equal(urlReferencedElsewhere([suggestion, other], "s1", url), true);
  });
});
