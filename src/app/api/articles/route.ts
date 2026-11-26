import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import {
  createArticle,
  deleteArticle,
  deleteArticleLocalization,
  listArticles,
  updateArticle,
  upsertArticleLocalization,
} from "@/lib/articles";
import {
  ARTICLE_BODY_MAX,
  ARTICLE_COVER_MAX,
  ARTICLE_KINDS,
  ARTICLE_SLUG_MAX,
  ARTICLE_SLUG_PATTERN,
  ARTICLE_SUMMARY_MAX,
  ARTICLE_TITLE_MAX,
} from "@/lib/articles/types";
import { LOCALES } from "@/lib/coach/types";

/**
 * Coach News articles (`assistant.articles`, backend 2.7.0) for staff: the list, create with its
 * localizations, metadata updates (publish, unpublish, retire, cover), and per-locale writes. The
 * limits repeat the table CHECKs so a bad value fails here with a readable message.
 */

const localeSchema = z.enum(LOCALES);
const nonBlank = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

const localizationSchema = z.object({
  locale: localeSchema,
  title: nonBlank(ARTICLE_TITLE_MAX, "title"),
  summary: z
    .string()
    .trim()
    .max(ARTICLE_SUMMARY_MAX, `summary must be at most ${ARTICLE_SUMMARY_MAX} characters`)
    .nullish()
    .transform((value) => value || null),
  body_md: nonBlank(ARTICLE_BODY_MAX, "body"),
});

const slugSchema = z
  .string()
  .max(ARTICLE_SLUG_MAX)
  .regex(ARTICLE_SLUG_PATTERN, "slug uses lower-case letters, digits, - and _");
const coverSchema = z
  .string()
  .trim()
  .max(ARTICLE_COVER_MAX)
  .regex(/^https:\/\/\S+$/, "cover must be an https URL")
  .nullable();
const publishedAtSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "published_at must be a timestamp")
  .nullable();

const metaSchema = z.object({
  slug: slugSchema,
  kind: z.enum(ARTICLE_KINDS),
  active: z.boolean(),
  published_at: publishedAtSchema,
  cover_image_url: coverSchema,
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    meta: metaSchema,
    localizations: z.array(localizationSchema).min(1),
  }),
  z.object({ action: z.literal("update"), id: z.string().uuid(), patch: metaSchema.partial() }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
  z.object({ action: z.literal("upsert_localization"), article_id: z.string().uuid(), localization: localizationSchema }),
  z.object({ action: z.literal("delete_localization"), article_id: z.string().uuid(), locale: localeSchema }),
]);

function failure(error: unknown, fallback: string, status: number): Response {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) {
    const message = error.issues.map((issue) => issue.message).join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
    return NextResponse.json({ articles: await listArticles(token) });
  } catch (error) {
    return failure(error, "Failed to load articles", 500);
  }
}

export async function POST(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const body = actionSchema.parse(await request.json());

    switch (body.action) {
      case "create": {
        if (!body.localizations.some((loc) => loc.locale === "en")) {
          throw new Error("An article needs its en localization");
        }
        const locales = body.localizations.map((loc) => loc.locale);
        if (new Set(locales).size !== locales.length) throw new Error("Each locale can appear once");
        const article = await createArticle(token, body.meta, body.localizations);
        return NextResponse.json({ article });
      }
      case "update": {
        const article = await updateArticle(token, body.id, body.patch);
        return NextResponse.json({ article });
      }
      case "delete": {
        await deleteArticle(token, body.id);
        return NextResponse.json({ ok: true });
      }
      case "upsert_localization": {
        await upsertArticleLocalization(token, body.article_id, body.localization);
        return NextResponse.json({ ok: true });
      }
      case "delete_localization": {
        if (body.locale === "en") throw new Error("The en localization cannot be deleted");
        await deleteArticleLocalization(token, body.article_id, body.locale);
        return NextResponse.json({ ok: true });
      }
    }
  } catch (error) {
    return failure(error, "Article action failed", 400);
  }
}
