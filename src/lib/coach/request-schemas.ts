import { z } from "zod";
import {
  ANSWER_MD_MAX,
  CARD_STATUSES,
  LOCALES,
  PROMPT_BODY_MAX,
  PROMPT_KEYS,
  SUGGESTION_KINDS,
  SUGGESTION_TEXT_MAX,
} from "./types.ts";

/** Bodies of the Coach API routes. */

const id = z.guid({ error: "id is required" });
const slug = z.string().trim().min(1, "slug is required").max(120);
const tierCode = z.string().trim().min(1, "tier_code is required").max(64);
/** Free text that may be blank (stored as null when blank). */
const optionalText = (max: number) => z.string().max(max).nullish();

export const tierCapabilitiesSchema = z.object({
  tier_code: tierCode,
  personal_data_enabled: z.boolean(),
  plan_builder_enabled: z.boolean(),
  max_tool_rounds: z.int().min(1).max(8, "max_tool_rounds must be an integer from 1 to 8"),
});

export const promptActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["activate", "deactivate"]), id }),
  z.object({
    action: z.literal("create").optional(),
    prompt_key: z.enum(PROMPT_KEYS),
    locale: z.enum(LOCALES),
    body_md: z.string().trim().min(1, "body_md is required").max(PROMPT_BODY_MAX),
  }),
]);

/** A cap is a whole number ≥ 0; weekly and hourly may be null (no cap). The Function checks the bounds. */
const tokenCap = z.int().nonnegative();

export const tokenLimitSchema = z.object({
  tierCode: tierCode,
  monthlyTokenLimit: tokenCap.optional(),
  weeklyTokenLimit: tokenCap.nullish(),
  hourlyBurstLimit: tokenCap.nullish(),
});

const suggestionFlags = {
  active: z.boolean().optional(),
  requires_personal_data: z.boolean().optional(),
  requires_plan_builder: z.boolean().optional(),
  unlocks_after: optionalText(120),
  section_slug: optionalText(120),
  sort_order: z.int().optional(),
};

const answerMd = (field: string) =>
  z.string().trim().max(ANSWER_MD_MAX, `${field} must be ≤ ${ANSWER_MD_MAX} characters`).nullish();

const suggestionText = (field: string) =>
  z
    .string({ error: `${field} is required` })
    .trim()
    .min(1, `${field} is required`)
    .max(SUGGESTION_TEXT_MAX, `${field} must be ≤ ${SUGGESTION_TEXT_MAX} characters`);

export const suggestionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), id }),
  z.object({
    action: z.literal("update"),
    id,
    slug: slug.optional(),
    kind: z.enum(SUGGESTION_KINDS).optional(),
    ...suggestionFlags,
  }),
  z.object({
    action: z.literal("upsert_localization"),
    suggestion_id: id,
    locale: z.enum(LOCALES),
    text: suggestionText("text"),
    answer_md: answerMd("answer_md"),
  }),
  z.object({
    action: z.literal("delete_localization"),
    suggestion_id: id,
    locale: z.enum(LOCALES).refine((locale) => locale !== "en", "The en localization cannot be deleted"),
  }),
  z.object({
    action: z.literal("create").optional(),
    slug,
    kind: z.enum(SUGGESTION_KINDS).optional(),
    ...suggestionFlags,
    en_text: suggestionText("en_text"),
    en_answer_md: answerMd("en_answer_md"),
  }),
]);

/** A year as the form sends it: a number, its digits, or blank. */
const year = z
  .union([z.int().min(0).max(3000), z.string().trim().regex(/^\d{0,4}$/, "year must be a number")])
  .nullish()
  .transform((value) => (value == null || value === "" ? null : Number(value)));

/** A list as the form sends it: an array, or text split on new lines and commas. */
const stringList = z.union([z.array(z.string().max(2000)).max(200), z.string().max(20_000)]).nullish();

/** Links are shown to staff and users: http(s) only. */
const sourceUrl = z
  .union([z.literal(""), z.url({ protocol: /^https?$/, error: "url must be an http(s) link" }).max(2000)])
  .nullish();

/** An optional id: blank means a new row. */
const optionalId = z
  .union([z.literal(""), z.guid()])
  .optional()
  .transform((value) => value || undefined);

export const knowledgeActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert_source"),
    id: optionalId,
    kind: z.string().trim().max(40).optional(),
    title: z.string().trim().min(1, "title is required").max(1000),
    authors: optionalText(2000),
    year,
    doi: optionalText(200),
    url: sourceUrl,
    license: optionalText(200),
  }),
  z.object({
    action: z.literal("upsert_card"),
    id: optionalId,
    source_id: z.guid({ error: "source_id is required" }),
    topic: optionalText(200),
    locale: z.string().trim().max(16).optional(),
    title: z.string().trim().min(1, "title is required").max(1000),
    summary_md: optionalText(20_000),
    key_claims: stringList,
    evidence_level: optionalText(200),
    population: optionalText(2000),
    practical_takeaway: optionalText(20_000),
    caveats: optionalText(20_000),
    tags: stringList,
    status: z.enum(CARD_STATUSES).optional(),
  }),
  z.object({ action: z.enum(["delete_source", "delete_card", "embed_card"]), id }),
]);

export const candidateActionSchema = z.object({
  action: z.enum(["dismiss", "restore", "accept"]),
  id: z.guid({ error: "id must be a candidate uuid" }),
});
