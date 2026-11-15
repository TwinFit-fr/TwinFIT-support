"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Images, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { TabList, TabPanel } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { cn } from "@/lib/utils";
import {
  articleStatus,
  changedLocales,
  draftFromArticle,
  draftWarnings,
  editorialHint,
  emptyDraft,
  fromLocalInputValue,
  insertImageMarkdown,
  isBlankLocalization,
  isDirty,
  localizationInput,
  metaInput,
  normalizeDraft,
  planSave,
  validateDraft,
  type ArticleDraft,
  type DraftLocalization,
} from "@/lib/articles/draft";
import {
  ARTICLE_BODY_MAX,
  ARTICLE_KINDS,
  ARTICLE_KIND_LABELS,
  ARTICLE_SLUG_MAX,
  ARTICLE_SUMMARY_MAX,
  ARTICLE_TITLE_MAX,
  type Article,
  type ArticleKind,
  type ArticleStatus,
} from "@/lib/articles/types";
import { APP_IMAGE_HOSTS } from "@/lib/coach/image-hosts";
import { isAllowedImageUrl, lintMarkdown } from "@/lib/coach/markdown";
import { articleFolder, altFromFileName } from "@/lib/coach/media";
import { LOCALES, type Locale } from "@/lib/coach/types";
import { MediaLibraryDialog, type LibraryPick } from "@/components/coach/media-library";
import { AppMarkdown, appColors, appType } from "@/components/coach/phone-preview";
import { useImageUpload } from "./use-image-upload";

export const STATUS_STYLES: Record<ArticleStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  scheduled: "bg-sky-100 text-sky-800",
  published: "bg-emerald-100 text-emerald-800",
  retired: "bg-amber-100 text-amber-800",
};

type Props = {
  /** The saved article, or null for a new one. */
  article: Article | null;
  /** The kind a new article starts with. */
  initialKind?: ArticleKind;
  onDirtyChange: (dirty: boolean) => void;
  /** Called after a write (the page refreshes its list); receives the article when the server returned it. */
  onSaved: (article?: Article) => Promise<unknown>;
  onDeleted: () => Promise<unknown>;
};

type LibraryTarget = "cover" | "body";

const textareaClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400";

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span className={cn("text-[11px] tabular-nums", value > max ? "font-medium text-red-600" : "text-zinc-500")}>
      {value}/{max}
    </span>
  );
}

/**
 * The editor of one News article: metadata, cover, the four locales with a preview as the app draws
 * the markdown, and the publish controls. The draft is local; Save (or Publish / Unpublish, which
 * save the edits too) is the only write. `en` is required and blocks Save; other missing locales
 * only warn, because the app falls back to `en`.
 */
export function ArticleWorkspace({ article, initialKind, onDirtyChange, onSaved, onDeleted }: Props) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = article === null;
  const [base, setBase] = useState<ArticleDraft>(() => (article ? draftFromArticle(article) : emptyDraft(initialKind)));
  const [draft, setDraft] = useState<ArticleDraft>(base);
  const [locale, setLocale] = useState<Locale>("en");
  const [saving, setSaving] = useState(false);
  const [library, setLibrary] = useState<LibraryTarget | null>(null);
  const [publishAt, setPublishAt] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const bodyFileRef = useRef<HTMLInputElement>(null);
  const folder = articleFolder(draft.slug);
  const { upload, uploading } = useImageUpload(folder);

  const dirty = useMemo(() => isDirty(base, draft), [base, draft]);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // A fresh article from the server (list refresh) replaces the base unless there are local edits.
  useEffect(() => {
    if (!article || dirtyRef.current) return;
    const next = draftFromArticle(article);
    setBase(next);
    setDraft(next);
  }, [article]);

  const problems = useMemo(() => validateDraft(draft), [draft]);
  const warnings = useMemo(() => draftWarnings(draft), [draft]);
  const changed = useMemo(() => new Set(changedLocales(base, draft)), [base, draft]);
  const status = article ? articleStatus(draft) : null;
  const hint = editorialHint(draft.kind);
  const slugLocked = !draft.slug.trim();

  const setMeta = (patch: Partial<ArticleDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setLoc = (target: Locale, patch: Partial<DraftLocalization>) =>
    setDraft((d) => ({ ...d, localizations: { ...d.localizations, [target]: { ...d.localizations[target], ...patch } } }));

  /** Writes `next` (normalized): create for a new article, otherwise the changed locales, then the metadata. */
  async function persist(next: ArticleDraft): Promise<boolean> {
    const clean = normalizeDraft(next);
    const blocking = validateDraft(clean);
    if (blocking.length > 0) {
      toast.error(blocking[0].message, "Not saved");
      return false;
    }
    setSaving(true);
    try {
      if (!article) {
        const result = (await staffFetch("/api/articles", {
          method: "POST",
          body: JSON.stringify({
            action: "create",
            meta: metaInput(clean),
            localizations: LOCALES.filter((l) => !isBlankLocalization(clean.localizations[l])).map((l) => localizationInput(clean, l)),
          }),
        })) as { article: Article };
        setBase(clean);
        setDraft(clean);
        toast.success(`Created ${result.article.slug}.`);
        await onSaved(result.article);
        return true;
      }
      const plan = planSave(base, clean);
      for (const target of plan.upserts) {
        await staffFetch("/api/articles", {
          method: "POST",
          body: JSON.stringify({ action: "upsert_localization", article_id: article.id, localization: localizationInput(clean, target) }),
        });
      }
      for (const target of plan.deletes) {
        await staffFetch("/api/articles", {
          method: "POST",
          body: JSON.stringify({ action: "delete_localization", article_id: article.id, locale: target }),
        });
      }
      // The metadata goes last so the article it returns already holds the written locales.
      let saved: Article | undefined;
      if (plan.meta) {
        saved = ((await staffFetch("/api/articles", {
          method: "POST",
          body: JSON.stringify({ action: "update", id: article.id, patch: plan.meta }),
        })) as { article: Article }).article;
      }
      setBase(clean);
      setDraft(clean);
      await onSaved(saved);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed", "Not saved completely");
      await onSaved();
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (await persist(draft)) toast.success("Saved.");
  }

  async function publish() {
    const at = fromLocalInputValue(publishAt) ?? new Date().toISOString();
    const scheduled = Date.parse(at) > Date.now();
    const lines = warnings.map((w) => `• ${w.message}`);
    const ok = await confirm({
      title: scheduled ? `Schedule ${draft.slug}?` : `Publish ${draft.slug}?`,
      description: [
        scheduled
          ? `Users see it from ${new Date(at).toLocaleString()}.`
          : "Users see it in the Coach News right away.",
        ...(dirty ? ["Your unsaved edits are saved with it."] : []),
        ...(draft.active ? [] : ["It is also set active again."]),
        ...(lines.length > 0 ? ["", "Check first:", ...lines] : []),
      ].join("\n"),
      confirmLabel: scheduled ? "Schedule" : "Publish",
    });
    if (!ok) return;
    if (await persist({ ...draft, active: true, published_at: at })) {
      setPublishAt("");
      toast.success(scheduled ? "Scheduled." : "Published.");
    }
  }

  async function unpublish() {
    const ok = await confirm({
      title: `Unpublish ${draft.slug}?`,
      description: "It goes back to a draft and disappears from the Coach News. Your text is kept.",
      confirmLabel: "Unpublish",
    });
    if (!ok) return;
    if (await persist({ ...draft, published_at: null })) toast.success("Unpublished.");
  }

  async function discard() {
    if (!dirty) return;
    const ok = await confirm({
      title: "Discard unsaved changes?",
      description: "Your edits to this article are lost. Images already uploaded stay in Storage.",
      confirmLabel: "Discard",
      variant: "danger",
    });
    if (ok) setDraft(base);
  }

  async function remove() {
    if (!article) return;
    const ok = await confirm({
      title: `Delete ${article.slug}?`,
      description: "Every localization is deleted and users no longer see it. Images in Storage are kept. To hide it and keep the text, unpublish it instead.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await staffFetch("/api/articles", { method: "POST", body: JSON.stringify({ action: "delete", id: article.id }) });
      setDraft(base);
      toast.success(`Deleted ${article.slug}.`);
      await onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  async function uploadFiles(target: LibraryTarget, files: File[]) {
    const file = files[0];
    if (!file) return;
    try {
      const uploaded = await upload(file);
      if (target === "cover") {
        setMeta({ cover_image_url: uploaded.url });
        toast.success("Cover uploaded.");
      } else {
        insertBody({ url: uploaded.url, alt: altFromFileName(uploaded.name), name: uploaded.name });
        toast.success("Image uploaded and inserted.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed", "Not uploaded");
    }
  }

  function insertBody(pick: LibraryPick) {
    const el = bodyRef.current;
    const current = draft.localizations[locale].body_md;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const result = insertImageMarkdown(current, start, end, pick.alt, pick.url);
    setLoc(locale, { body_md: result.body });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(result.cursor, result.cursor);
    });
  }

  function onPick(pick: LibraryPick) {
    if (library === "cover") setMeta({ cover_image_url: pick.url });
    else insertBody(pick);
    setLibrary(null);
  }

  const resolveImage = (url: string) => (isAllowedImageUrl(url, APP_IMAGE_HOSTS) ? url : null);
  const savedStatus = article ? articleStatus(article) : null;
  const coverUrl = draft.cover_image_url.trim();
  const busy = saving || uploading;

  return (
    <div className="min-w-0 space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <label className="min-w-[220px] flex-1 space-y-1 text-sm">
            <span className="flex justify-between font-medium text-zinc-700">
              Slug <span className="text-[11px] font-normal text-zinc-500">{draft.slug.length}/{ARTICLE_SLUG_MAX}</span>
            </span>
            <Input
              value={draft.slug}
              maxLength={ARTICLE_SLUG_MAX}
              placeholder="creatine-and-strength"
              aria-label="Slug"
              onChange={(event) => setMeta({ slug: event.target.value.toLowerCase() })}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-zinc-700">Kind</span>
            <select
              aria-label="Kind"
              className="block rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={draft.kind}
              onChange={(event) => setMeta({ kind: event.target.value as ArticleKind })}
            >
              {ARTICLE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {ARTICLE_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pt-7 text-sm text-zinc-700">
            <input type="checkbox" checked={draft.active} onChange={(event) => setMeta({ active: event.target.checked })} />
            Active
            <span className="text-[11px] text-zinc-500">(off = retired, hidden whatever the date)</span>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-3 text-sm">
          <div>
            <span className="block text-xs font-medium text-zinc-700">Status</span>
            {status ? (
              <Badge className={cn("mt-1", STATUS_STYLES[status])}>{status}</Badge>
            ) : (
              <Badge className="mt-1 bg-zinc-100 text-zinc-700">new</Badge>
            )}
            {draft.published_at && (
              <span className="ml-2 text-xs text-zinc-500">{new Date(draft.published_at).toLocaleString()}</span>
            )}
          </div>
          {article && (
            <>
              <label className="space-y-1 text-xs font-medium text-zinc-700">
                Publish at (empty = now)
                <input
                  type="datetime-local"
                  aria-label="Publish at"
                  className="block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm font-normal"
                  value={publishAt}
                  onChange={(event) => setPublishAt(event.target.value)}
                />
              </label>
              <Button type="button" disabled={busy || problems.length > 0} onClick={() => void publish()}>
                {publishAt ? "Schedule" : savedStatus === "published" ? "Republish now" : "Publish"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || draft.published_at === null}
                onClick={() => void unpublish()}
              >
                Unpublish
              </Button>
            </>
          )}
          {isNew && <span className="text-xs text-zinc-500">Create the draft first, then publish it.</span>}
        </div>
      </Card>

      <Card className="space-y-2">
        <p className="text-sm font-medium text-zinc-700">Cover image</p>
        <div className="flex flex-wrap items-start gap-3">
          {coverUrl && (
            <div className="h-24 w-40 shrink-0 overflow-hidden rounded-md bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs, no optimisation */}
              <img src={coverUrl} alt="Cover preview" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="min-w-[240px] flex-1 space-y-2">
            <Input
              aria-label="Cover image URL"
              placeholder="https://… (upload one, or paste a coach-media URL)"
              value={draft.cover_image_url}
              onChange={(event) => setMeta({ cover_image_url: event.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-2.5"
                disabled={busy || slugLocked}
                title={slugLocked ? "Set the slug first: uploads go to articles/{slug}" : `Uploads to ${folder}`}
                onClick={() => coverFileRef.current?.click()}
              >
                <ImagePlus className="h-3.5 w-3.5" /> Upload cover
              </Button>
              <Button type="button" variant="secondary" className="h-8 px-2.5" disabled={busy} onClick={() => setLibrary("cover")}>
                <Images className="h-3.5 w-3.5" /> Library
              </Button>
              {coverUrl && (
                <Button type="button" variant="ghost" className="h-8 px-2.5" onClick={() => setMeta({ cover_image_url: "" })}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              )}
              <input
                ref={coverFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Upload cover image"
                onChange={(event) => {
                  void uploadFiles("cover", Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-3 border-sky-200 bg-sky-50/60 text-sm text-sky-950">
        <p className="font-medium">Editorial guide · {ARTICLE_KIND_LABELS[draft.kind]}</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {hint.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      <div>
        <TabList
          label="Locale"
          value={locale}
          onChange={setLocale}
          tabs={LOCALES.map((l) => ({
            id: l,
            label: l,
            badge: (
              <span className="flex items-center gap-1">
                <Badge
                  className={cn(
                    "px-1.5 py-0",
                    isBlankLocalization(draft.localizations[l])
                      ? l === "en"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800",
                  )}
                >
                  {isBlankLocalization(draft.localizations[l]) ? "missing" : "ok"}
                </Badge>
                {changed.has(l) && <span className="text-amber-600" title="Unsaved edits" aria-label="Unsaved edits">●</span>}
              </span>
            ),
          }))}
        />
        {LOCALES.map((l) => {
          const loc = draft.localizations[l];
          const lint = lintMarkdown(loc.body_md);
          return (
            <TabPanel key={l} id={l} selected={locale === l}>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0 space-y-3">
                  <label className="block space-y-1 text-sm">
                    <span className="flex justify-between font-medium text-zinc-700">
                      Title {l === "en" && <span className="text-red-600">*</span>} <Counter value={loc.title.length} max={ARTICLE_TITLE_MAX} />
                    </span>
                    <Input aria-label={`Title (${l})`} value={loc.title} onChange={(event) => setLoc(l, { title: event.target.value })} />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="flex justify-between font-medium text-zinc-700">
                      Summary (optional, shown in the list) <Counter value={loc.summary.length} max={ARTICLE_SUMMARY_MAX} />
                    </span>
                    <textarea
                      aria-label={`Summary (${l})`}
                      className={textareaClass}
                      rows={2}
                      value={loc.summary}
                      onChange={(event) => setLoc(l, { summary: event.target.value })}
                    />
                  </label>
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor={`body-${l}`} className="font-medium text-zinc-700">
                        Body (markdown) {l === "en" && <span className="text-red-600">*</span>}
                      </label>
                      <div className="flex items-center gap-2">
                        <Counter value={loc.body_md.length} max={ARTICLE_BODY_MAX} />
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-7 px-2 text-xs"
                          disabled={busy || slugLocked}
                          title={slugLocked ? "Set the slug first: uploads go to articles/{slug}" : `Uploads to ${folder}`}
                          onClick={() => bodyFileRef.current?.click()}
                        >
                          <ImagePlus className="h-3.5 w-3.5" /> Upload image
                        </Button>
                        <Button type="button" variant="secondary" className="h-7 px-2 text-xs" disabled={busy} onClick={() => setLibrary("body")}>
                          <Images className="h-3.5 w-3.5" /> Library
                        </Button>
                      </div>
                    </div>
                    <textarea
                      id={`body-${l}`}
                      ref={locale === l ? bodyRef : undefined}
                      className={cn(textareaClass, "font-mono text-[13px]")}
                      rows={16}
                      value={loc.body_md}
                      onChange={(event) => setLoc(l, { body_md: event.target.value })}
                    />
                    {lint.length > 0 && (
                      <ul className="space-y-0.5 text-xs text-amber-800">
                        {lint.slice(0, 5).map((warning) => (
                          <li key={`${warning.rule}-${warning.line}`}>
                            Line {warning.line}: {warning.message}
                          </li>
                        ))}
                        {lint.length > 5 && <li>…and {lint.length - 5} more.</li>}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="mb-1 text-sm font-medium text-zinc-700">Preview · as the app draws it</p>
                  <div
                    className="mx-auto max-w-[412px] space-y-3 rounded-2xl p-4"
                    style={{ background: appColors.surface, fontFamily: appColors.font }}
                  >
                    {coverUrl && isAllowedImageUrl(coverUrl, APP_IMAGE_HOSTS) && (
                      // eslint-disable-next-line @next/next/no-img-element -- storage URLs, no optimisation
                      <img src={coverUrl} alt="" style={{ width: "100%", borderRadius: 12, display: "block" }} />
                    )}
                    <Badge className="bg-white/10 text-white">{ARTICLE_KIND_LABELS[draft.kind]}</Badge>
                    <p style={{ ...appType.titleH3, color: appColors.label, margin: 0 }}>
                      {loc.title || <span style={{ color: appColors.labelMuted }}>Title</span>}
                    </p>
                    {loc.summary && <p style={{ ...appType.body, color: appColors.labelMuted, margin: 0 }}>{loc.summary}</p>}
                    <AppMarkdown source={loc.body_md} resolveImage={resolveImage} />
                  </div>
                  {l !== "en" && isBlankLocalization(loc) && (
                    <p className="mt-2 text-xs text-amber-800">No {l} text yet: {l} users will read the en version.</p>
                  )}
                </div>
              </div>
            </TabPanel>
          );
        })}
        <input
          ref={bodyFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Upload body image"
          onChange={(event) => {
            void uploadFiles("body", Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>

      {(warnings.length > 0 || (dirty && problems.length > 0)) && (
        <Card className="space-y-2 text-sm">
          {dirty && problems.length > 0 && (
            <div>
              <p className="font-medium text-red-700">Fix before saving</p>
              <ul className="list-disc pl-5 text-red-700">
                {problems.map((problem) => (
                  <li key={problem.message}>{problem.message}</li>
                ))}
              </ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div>
              <p className="font-medium text-amber-800">Worth a look (does not block)</p>
              <ul className="list-disc pl-5 text-amber-800">
                {warnings.map((warning) => (
                  <li key={warning.message}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white/95 p-3 backdrop-blur-xs">
        <Button type="button" disabled={!dirty || problems.length > 0 || busy} onClick={() => void save()}>
          {isNew ? "Create draft" : "Save"}
        </Button>
        <Button type="button" variant="secondary" disabled={!dirty || busy} onClick={() => void discard()}>
          Discard
        </Button>
        <span className="text-xs text-zinc-500">{dirty ? "Unsaved changes" : "Nothing to save"}</span>
        {article && (
          <Button type="button" variant="ghost" className="ml-auto text-red-600" disabled={busy} onClick={() => void remove()}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
      </div>

      {library && <MediaLibraryDialog defaultFolder={folder} mode="insert" onPick={onPick} onClose={() => setLibrary(null)} />}
    </div>
  );
}
