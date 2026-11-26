import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidateActionSchema,
  knowledgeActionSchema,
  promptActionSchema,
  suggestionActionSchema,
  tierCapabilitiesSchema,
  tokenLimitSchema,
} from "./request-schemas.ts";

const ID = "22222222-2222-4222-8222-222222222222";

describe("Coach request schemas", () => {
  it("tier capabilities: max_tool_rounds is an integer from 1 to 8", () => {
    const body = { tier_code: "premium", personal_data_enabled: true, plan_builder_enabled: false, max_tool_rounds: 4 };
    assert.equal(tierCapabilitiesSchema.safeParse(body).success, true);
    assert.equal(tierCapabilitiesSchema.safeParse({ ...body, max_tool_rounds: 9 }).success, false);
    assert.equal(tierCapabilitiesSchema.safeParse({ ...body, max_tool_rounds: 2.5 }).success, false);
    assert.equal(tierCapabilitiesSchema.safeParse({ ...body, personal_data_enabled: "true" }).success, false);
  });

  it("prompts: create or (de)activate", () => {
    assert.equal(promptActionSchema.safeParse({ action: "activate", id: ID }).success, true);
    assert.equal(promptActionSchema.safeParse({ action: "activate" }).success, false);
    const created = promptActionSchema.parse({ prompt_key: "system_style", locale: "fr", body_md: " Hi " });
    assert.deepEqual(created, { prompt_key: "system_style", locale: "fr", body_md: "Hi" });
    assert.equal(promptActionSchema.safeParse({ prompt_key: "system_style", locale: "fr", body_md: "x".repeat(4001) }).success, false);
    assert.equal(promptActionSchema.safeParse({ prompt_key: "other", locale: "fr", body_md: "x" }).success, false);
  });

  it("token limits: whole numbers, weekly and hourly may be null", () => {
    assert.equal(tokenLimitSchema.safeParse({ tierCode: "free", monthlyTokenLimit: 0, weeklyTokenLimit: null, hourlyBurstLimit: 10 }).success, true);
    assert.equal(tokenLimitSchema.safeParse({ tierCode: "free", monthlyTokenLimit: -1 }).success, false);
    assert.equal(tokenLimitSchema.safeParse({ tierCode: "free", monthlyTokenLimit: "100" }).success, false);
    assert.equal(tokenLimitSchema.safeParse({ monthlyTokenLimit: 100 }).success, false);
  });

  it("suggestions: every action the editor sends", () => {
    for (const body of [
      { slug: "squat", kind: "lesson", en_text: "How to squat", en_answer_md: null },
      { action: "delete", id: ID },
      { action: "update", id: ID, active: true, requires_personal_data: false, requires_plan_builder: false, unlocks_after: "", section_slug: "basics", sort_order: 3 },
      { action: "upsert_localization", suggestion_id: ID, locale: "de", text: "Kniebeuge", answer_md: "" },
      { action: "delete_localization", suggestion_id: ID, locale: "es" },
    ]) {
      assert.equal(suggestionActionSchema.safeParse(body).success, true, JSON.stringify(body));
    }
    assert.equal(suggestionActionSchema.safeParse({ action: "delete_localization", suggestion_id: ID, locale: "en" }).success, false);
    assert.equal(suggestionActionSchema.safeParse({ action: "wipe", id: ID }).success, false);
    assert.equal(suggestionActionSchema.safeParse({ slug: "x", en_text: "y".repeat(121) }).success, false);
    assert.equal(suggestionActionSchema.safeParse({ action: "update", id: "1 or 1=1" }).success, false);
  });

  it("knowledge: form bodies, with years and lists as text", () => {
    const source = knowledgeActionSchema.parse({
      action: "upsert_source", id: undefined, kind: "paper", title: "Study", authors: "", year: "2021", doi: "", url: "https://doi.org/10.1/x", license: "",
    });
    assert.equal(source.action === "upsert_source" && source.year, 2021);
    const card = knowledgeActionSchema.parse({
      action: "upsert_card", id: "", source_id: ID, topic: "", locale: "en", title: "Card", summary_md: "", key_claims: "a\nb",
      evidence_level: "", population: "", practical_takeaway: "", caveats: "", tags: "x, y", status: "draft",
    });
    assert.equal(card.action === "upsert_card" && card.id, undefined);
    assert.equal(knowledgeActionSchema.safeParse({ action: "embed_card", id: ID }).success, true);
  });

  it("knowledge: refuses script links, bad ids and unknown statuses", () => {
    const source = { action: "upsert_source", title: "Study" };
    assert.equal(knowledgeActionSchema.safeParse({ ...source, url: "javascript:alert(1)" }).success, false);
    assert.equal(knowledgeActionSchema.safeParse({ ...source, year: "20x1" }).success, false);
    assert.equal(knowledgeActionSchema.safeParse({ action: "upsert_card", source_id: "", title: "x" }).success, false);
    assert.equal(knowledgeActionSchema.safeParse({ action: "upsert_card", source_id: ID, title: "x", status: "live" }).success, false);
    assert.equal(knowledgeActionSchema.safeParse({ action: "delete_card" }).success, false);
  });

  it("candidates: a known action on a candidate uuid", () => {
    assert.equal(candidateActionSchema.safeParse({ action: "accept", id: ID }).success, true);
    assert.equal(candidateActionSchema.safeParse({ action: "accept", id: "abc" }).success, false);
    assert.equal(candidateActionSchema.safeParse({ action: "approve", id: ID }).success, false);
  });
});
