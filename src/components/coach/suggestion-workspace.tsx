"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { TabList, TabPanel } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { cn } from "@/lib/utils";
import { findImages, isAllowedImageUrl, replaceImage } from "@/lib/coach/markdown";
import {
  changedLocales,
  draftFromSuggestion,
  emptyLocalization,
  isDirty,
  localeStatus,
  pendingIdFromUrl,
  planSave,
  storageFileId,
  urlReferencedElsewhere,
  validateDraft,
  type DraftLocalization,
  type LessonDraft,
} from "@/lib/coach/lesson-draft";
import { LOCALES, SUGGESTION_TEXT_MAX, type Locale, type Suggestion } from "@/lib/coach/types";
import { MarkdownEditor, type PendingImage } from "./markdown-editor";
import {
  ChipPreview,
  LessonChatPreview,
  LessonsSheetPreview,
  PREVIEW_DEVICES,
  PhoneFrame,
  usePreviewDevice,
  type PreviewLessonRow,
  type PreviewLessonState,
} from "./phone-preview";

type Props = {
  suggestion: Suggestion;
  /** Every suggestion, for the lessons list in the preview and for orphan checks. */
  suggestions: readonly Suggestion[];
  /** Reports whether the draft has unsaved edits, so the page can guard navigation. */
  onDirtyChange: (dirty: boolean) => void;
  /** Called after a successful Save, so the page refreshes its list. */
  onSaved: () => Promise<unknown>;
  onDelete: () => void;
  busy: boolean;
};

type Viewer = "premium" | "freemium";
type Screen = "list" | "lesson";

/** The app draws images from its own Storage only (`imageHosts` in CoachHost.kt); the preview does the same. */
const APP_IMAGE_HOSTS: readonly string[] =
  process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN && process.env.NEXT_PUBLIC_NHOST_REGION
    ? [`${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.storage.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run`]
    : [];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Editor and phone preview for one suggestion. The draft is local; `Save` is the only write.
 * The preview renders a snapshot of the draft that refreshes on demand or when a field settles.
 */
export function SuggestionWorkspace({ suggestion, suggestions, onDirtyChange, onSaved, onDelete, busy }: Props) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const confirm = useConfirm();
  const [base, setBase] = useState<LessonDraft>(() => draftFromSuggestion(suggestion));
  const [draft, setDraft] = useState<LessonDraft>(base);
  const [preview, setPreview] = useState<LessonDraft>(base);
  const [locale, setLocale] = useState<Locale>("en");
  const [pending, setPending] = useState<Map<string, PendingImage>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const [device, setDevice] = usePreviewDevice();
  const [viewer, setViewer] = useState<Viewer>("premium");
  const [screen, setScreen] = useState<Screen>("lesson");
  const [lessonState, setLessonState] = useState<PreviewLessonState>("available");
  const [narrowTab, setNarrowTab] = useState<"editor" | "preview">("editor");
  const wide = useMediaQuery("(min-width: 1024px)");
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const dirty = useMemo(() => isDirty(base, draft), [base, draft]);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // A fresh suggestion from the server (after Save, or a list refresh) replaces the base unless
  // there are local edits; those keep their base until they are saved or discarded.
  useEffect(() => {
    if (dirtyRef.current) return;
    const next = draftFromSuggestion(suggestion);
    setBase(next);
    setDraft(next);
    setPreview(next);
  }, [suggestion]);
  const previewStale = useMemo(() => isDirty(preview, draft), [preview, draft]);
  const plan = useMemo(() => planSave(base, draft), [base, draft]);
  const problems = useMemo(() => validateDraft(draft), [draft]);
  const changed = useMemo(() => new Set(changedLocales(base, draft)), [base, draft]);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  /** Releases every local image preview; on unmount, discard, or once Save uploaded them. */
  const clearPending = useCallback(() => {
    setPending((current) => {
      for (const image of current.values()) URL.revokeObjectURL(image.objectUrl);
      return new Map();
    });
  }, []);

  useEffect(
    () => () => {
      for (const image of pendingRef.current.values()) URL.revokeObjectURL(image.objectUrl);
    },
    [],
  );

  const current: DraftLocalization = draft.localizations[locale] ?? emptyLocalization();
  const localeExists = Boolean(draft.localizations[locale]);

  const updateLocalization = useCallback(
    (loc: Locale, patch: Partial<DraftLocalization>) => {
      setDraft((d) => ({
        ...d,
        localizations: {
          ...d.localizations,
          [loc]: { ...(d.localizations[loc] ?? emptyLocalization()), ...patch },
        },
      }));
    },
    [],
  );

  const refreshPreview = useCallback(() => setPreview(draft), [draft]);

  /** Pending uploads preview from their local copy; saved ones load like the app would. */
  const resolvePreviewImage = useCallback(
    (url: string) => {
      const pendingId = pendingIdFromUrl(url);
      if (pendingId) return pending.get(pendingId)?.objectUrl ?? null;
      return isAllowedImageUrl(url, APP_IMAGE_HOSTS) ? url : null;
    },
    [pending],
  );

  function addImages(files: File[]): string[] {
    const added: PendingImage[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      objectUrl: URL.createObjectURL(file),
    }));
    setPending((map) => {
      const next = new Map(map);
      for (const image of added) next.set(image.id, image);
      return next;
    });
    return added.map((image) => image.id);
  }

  async function discard() {
    if (!dirty) return;
    const ok = await confirm({
      title: "Discard unsaved changes?",
      description: `Edits to ${plan.summary.join(", ")} will be lost. Pending images are dropped without uploading.`,
      confirmLabel: "Discard",
      variant: "danger",
    });
    if (!ok) return;
    setDraft(base);
    setPreview(base);
    clearPending();
  }

  async function save() {
    if (!dirty || problems.length > 0 || saving) return;
    setSaving(true);
    const uploaded: { id: string; url: string }[] = [];
    try {
      // 1. Upload pending images referenced by the localizations being saved, then swap the
      //    placeholders for Storage URLs in a copy of the draft.
      let toSave = draft;
      for (const pendingId of plan.uploads) {
        const image = pending.get(pendingId);
        if (!image) throw new Error("A pending image is missing; remove it from the text and retry.");
        const ownerLocale =
          LOCALES.find((loc) =>
            findImages(toSave.localizations[loc]?.answer_md ?? "").some((img) => pendingIdFromUrl(img.url) === pendingId),
          ) ?? locale;
        const alt =
          findImages(toSave.localizations[ownerLocale]?.answer_md ?? "").find(
            (img) => pendingIdFromUrl(img.url) === pendingId,
          )?.alt ?? image.file.name;
        const result = (await staffFetch("/api/coach/media", {
          method: "POST",
          body: JSON.stringify({
            mimeType: image.file.type || "image/png",
            data: await readFileAsBase64(image.file),
            slug: suggestion.slug,
            locale: ownerLocale,
            fileName: image.file.name,
            alt,
          }),
        })) as { id: string; url: string };
        uploaded.push(result);
        const localizations = { ...toSave.localizations };
        for (const loc of LOCALES) {
          const entry = localizations[loc];
          if (!entry) continue;
          let md = entry.answer_md;
          for (const img of [...findImages(md)].reverse()) {
            if (pendingIdFromUrl(img.url) === pendingId) md = replaceImage(md, img, { url: result.url });
          }
          localizations[loc] = { ...entry, answer_md: md };
        }
        toSave = { ...toSave, localizations };
      }

      // 2. Write metadata and localizations.
      const finalPlan = planSave(base, toSave);
      for (const step of finalPlan.steps) {
        if (step.kind === "update_meta") {
          await staffFetch("/api/coach/suggestions", {
            method: "POST",
            body: JSON.stringify({ action: "update", id: suggestion.id, ...step.meta }),
          });
        } else if (step.kind === "upsert_localization") {
          await staffFetch("/api/coach/suggestions", {
            method: "POST",
            body: JSON.stringify({
              action: "upsert_localization",
              suggestion_id: suggestion.id,
              locale: step.locale,
              text: step.text,
              answer_md: step.answer_md,
            }),
          });
        } else {
          await staffFetch("/api/coach/suggestions", {
            method: "POST",
            body: JSON.stringify({ action: "delete_localization", suggestion_id: suggestion.id, locale: step.locale }),
          });
        }
      }

      // 3. Storage files this suggestion stopped referencing are removed, unless another one uses them.
      let orphanFailures = 0;
      for (const url of finalPlan.droppedUrls) {
        const fileId = storageFileId(url);
        if (!fileId || urlReferencedElsewhere(suggestions, suggestion.id, url)) continue;
        try {
          await staffFetch(`/api/coach/media?id=${encodeURIComponent(fileId)}`, { method: "DELETE" });
        } catch {
          orphanFailures++;
        }
      }

      setBase(toSave);
      setDraft(toSave);
      setPreview(toSave);
      clearPending();
      toast.success(`Saved ${finalPlan.summary.join(", ")}.`, suggestion.slug);
      if (orphanFailures > 0) {
        toast.info(`${orphanFailures} unused image file(s) could not be deleted from Storage.`);
      }
      await onSaved();
    } catch (err) {
      // Files uploaded in this attempt are not referenced by anything saved: remove them.
      for (const file of uploaded) {
        try {
          await staffFetch(`/api/coach/media?id=${encodeURIComponent(file.id)}`, { method: "DELETE" });
        } catch {
          /* best effort */
        }
      }
      toast.error(err instanceof Error ? err.message : "Save failed", "Nothing was saved");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      } else if (event.key === "Enter") {
        event.preventDefault();
        refreshPreview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function removeLocale(loc: Locale) {
    if (loc === "en") return;
    const ok = await confirm({
      title: `Remove the ${loc} localization?`,
      description: "It is deleted from the backend when you press Save.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    setDraft((d) => {
      const localizations = { ...d.localizations };
      delete localizations[loc];
      return { ...d, localizations };
    });
  }

  // ---- Preview data ----------------------------------------------------------------------------

  const previewLocalization = preview.localizations[locale] ?? preview.localizations.en ?? emptyLocalization();
  const previewUsesFallback = !preview.localizations[locale];
  const lockedOnFreemium = viewer === "freemium" && (preview.requires_personal_data || preview.requires_plan_builder);

  const lessonRows = useMemo<PreviewLessonRow[]>(() => {
    const titleFor = (row: Suggestion) =>
      row.localizations.find((l) => l.locale === locale)?.text ??
      row.localizations.find((l) => l.locale === "en")?.text ??
      row.slug;
    const withDraft = (row: Suggestion): Suggestion =>
      row.id !== suggestion.id
        ? row
        : {
            ...row,
            active: preview.active,
            requires_personal_data: preview.requires_personal_data,
            requires_plan_builder: preview.requires_plan_builder,
            unlocks_after: preview.unlocks_after.trim() || null,
            sort_order: preview.sort_order,
            localizations: LOCALES.flatMap((loc) => {
              const entry = preview.localizations[loc];
              return entry ? [{ suggestion_id: row.id, locale: loc, text: entry.text, answer_md: entry.answer_md }] : [];
            }),
          };
    const lessons = suggestions
      .filter((row) => row.kind === "lesson")
      .map(withDraft)
      .filter((row) => row.active)
      .filter((row) => viewer === "premium" || !(row.requires_personal_data || row.requires_plan_builder))
      .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug));
    const bySlug = new Map(lessons.map((row) => [row.slug, row]));
    return lessons.map((row) => {
      const isCurrent = row.id === suggestion.id;
      const prereq = row.unlocks_after ? bySlug.get(row.unlocks_after) : undefined;
      // Other lessons show the list's real structure: locked behind their prerequisite, if any.
      const state: PreviewLessonState = isCurrent ? lessonState : row.unlocks_after ? "locked" : "available";
      return {
        slug: row.slug,
        title: titleFor(row),
        state,
        lockedReasonTitle:
          state === "locked" ? (prereq ? titleFor(prereq) : (row.unlocks_after ?? undefined)) : undefined,
        current: isCurrent,
      };
    });
  }, [suggestions, suggestion.id, preview, locale, viewer, lessonState]);

  const prerequisite = suggestions.find((row) => row.slug === draft.unlocks_after.trim());
  const sectionSiblings = suggestions.filter(
    (row) => row.kind === suggestion.kind && (row.section_slug ?? "") === draft.section_slug.trim(),
  );

  // ---- Render ----------------------------------------------------------------------------------

  const editor = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <Card className="space-y-2 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">{suggestion.slug}</h2>
          <Badge>{suggestion.kind}</Badge>
          {dirty ? (
            <Badge className="bg-amber-100 text-amber-800" title={`Save will persist: ${plan.summary.join(", ")}`}>
              Unsaved · {plan.summary.join(", ")}
            </Badge>
          ) : (
            <Badge className="bg-emerald-100 text-emerald-800">Saved</Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="secondary" disabled={!dirty || saving || busy} onClick={discard}>
              Discard
            </Button>
            <Button
              type="button"
              disabled={!dirty || problems.length > 0 || saving || busy}
              title={problems.length ? problems.map((p) => p.message).join("\n") : "Save (Ctrl+S)"}
              onClick={save}
            >
              {saving ? "Saving…" : dirty ? `Save ${plan.summary.join(" + ")}` : "Save"}
            </Button>
            <Button type="button" variant="ghost" className="text-red-600" disabled={saving || busy} onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
        {problems.length > 0 && (
          <ul className="text-xs text-red-600">
            {problems.map((p) => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer select-none text-zinc-600">
            Flags and progression
            <span className="ml-2 text-xs text-zinc-500">
              {draft.active ? "active" : "inactive"}
              {draft.requires_personal_data || draft.requires_plan_builder ? " · Premium" : " · Freemium"}
              {draft.section_slug ? ` · section ${draft.section_slug}` : ""}
              {` · #${draft.sort_order}`}
              {draft.unlocks_after ? ` · after ${draft.unlocks_after}` : ""}
            </span>
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Active
            </label>
            <label className="flex items-center gap-2" title="Premium: hidden from Freemium users">
              <input
                type="checkbox"
                checked={draft.requires_personal_data}
                onChange={(e) => setDraft({ ...draft, requires_personal_data: e.target.checked })}
              />
              Requires personal data
            </label>
            <label className="flex items-center gap-2" title="Premium: hidden from Freemium users">
              <input
                type="checkbox"
                checked={draft.requires_plan_builder}
                onChange={(e) => setDraft({ ...draft, requires_plan_builder: e.target.checked })}
              />
              Requires plan builder
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Section slug</span>
              <Input value={draft.section_slug} onChange={(e) => setDraft({ ...draft, section_slug: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Sort order</span>
              <Input
                type="number"
                value={Number.isFinite(draft.sort_order) ? draft.sort_order : ""}
                onChange={(e) => setDraft({ ...draft, sort_order: e.target.value === "" ? NaN : Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Unlocks after (lesson slug)</span>
              <Input
                list="coach-lesson-slugs"
                value={draft.unlocks_after}
                onChange={(e) => setDraft({ ...draft, unlocks_after: e.target.value })}
              />
              <datalist id="coach-lesson-slugs">
                {suggestions
                  .filter((row) => row.kind === "lesson" && row.id !== suggestion.id)
                  .map((row) => (
                    <option key={row.id} value={row.slug} />
                  ))}
              </datalist>
            </label>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {draft.unlocks_after.trim()
              ? prerequisite
                ? `Locked until “${prerequisite.localizations.find((l) => l.locale === "en")?.text ?? prerequisite.slug}” is read.`
                : `Warning: no lesson has slug “${draft.unlocks_after.trim()}”; the app shows this lesson as locked with no way to unlock it.`
              : "No prerequisite: available as soon as the user opens Tutorials."}
            {" "}
            {sectionSiblings.length > 1 &&
              `Position ${sectionSiblings.filter((row) => row.id !== suggestion.id && row.sort_order < draft.sort_order).length + 1} of ${sectionSiblings.length} in this section.`}
          </p>
        </details>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col gap-2 py-3">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Locale">
          {LOCALES.map((item) => {
            const status = localeStatus(draft, item);
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={locale === item}
                onClick={() => setLocale(item)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium",
                  locale === item ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100",
                )}
                title={
                  status === "missing"
                    ? "No localization yet"
                    : status === "no-answer"
                      ? "Chip text only; en has an answer this locale lacks"
                      : "Complete"
                }
              >
                {item}
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    status === "missing" ? "bg-red-400" : status === "no-answer" ? "bg-amber-400" : "bg-emerald-400",
                  )}
                />
                {changed.has(item) && <span className="text-[10px] opacity-80">●</span>}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-zinc-500">
            {LOCALES.filter((l) => localeStatus(draft, l) === "missing").length > 0 &&
              `Missing: ${LOCALES.filter((l) => localeStatus(draft, l) === "missing").join(", ")}`}
          </span>
          {locale !== "en" && localeExists && (
            <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => removeLocale(locale)}>
              Remove {locale}
            </Button>
          )}
        </div>

        {!localeExists && (
          <p className="rounded-md bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
            No {locale} localization. Type a chip text to create it on Save; the app falls back to en meanwhile.
          </p>
        )}

        <label className="block text-sm">
          <span className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>Chip text (lesson title)</span>
            <span className={cn("tabular-nums", current.text.length > SUGGESTION_TEXT_MAX && "font-medium text-red-600")}>
              {current.text.length}/{SUGGESTION_TEXT_MAX}
            </span>
          </span>
          <Input
            value={current.text}
            aria-invalid={current.text.length > SUGGESTION_TEXT_MAX || undefined}
            className={cn(current.text.length > SUGGESTION_TEXT_MAX && "border-red-400")}
            onChange={(e) => updateLocalization(locale, { text: e.target.value })}
            onBlur={refreshPreview}
          />
        </label>

        <span className="text-xs text-zinc-500">answer_md</span>
        <MarkdownEditor
          value={current.answer_md}
          onChange={(answer_md) => updateLocalization(locale, { answer_md })}
          onSettle={refreshPreview}
          onAddImages={addImages}
          pending={pending}
          onImageError={(message) => toast.error(message, "Image not added")}
          disabled={saving}
        />
      </Card>
    </div>
  );

  const previewPanel = (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          aria-label="Device"
          className="rounded-md border border-zinc-300 bg-white px-2 py-1"
          value={device.id}
          onChange={(e) => setDevice(e.target.value)}
        >
          {PREVIEW_DEVICES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Screen"
          className="rounded-md border border-zinc-300 bg-white px-2 py-1"
          value={screen}
          onChange={(e) => setScreen(e.target.value as Screen)}
        >
          <option value="lesson">{suggestion.kind === "lesson" ? "Lesson opened" : "Chip + answer"}</option>
          <option value="list">{suggestion.kind === "lesson" ? "Tutorials list" : "Chip in empty state"}</option>
        </select>
        <select
          aria-label="Viewer tier"
          className="rounded-md border border-zinc-300 bg-white px-2 py-1"
          value={viewer}
          onChange={(e) => setViewer(e.target.value as Viewer)}
        >
          <option value="premium">Premium user</option>
          <option value="freemium">Freemium user</option>
        </select>
        {suggestion.kind === "lesson" && screen === "list" && (
          <select
            aria-label="Lesson state"
            className="rounded-md border border-zinc-300 bg-white px-2 py-1"
            value={lessonState}
            onChange={(e) => setLessonState(e.target.value as PreviewLessonState)}
          >
            <option value="available">Available</option>
            <option value="seen">Seen</option>
            <option value="locked">Locked (prerequisite unread)</option>
          </select>
        )}
        <Button
          type="button"
          variant={previewStale ? "default" : "secondary"}
          className="ml-auto h-7 px-2 text-xs"
          onClick={refreshPreview}
          title="Update preview (Ctrl+Enter)"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {previewStale ? "Update preview" : "Preview is current"}
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        {locale} · {previewUsesFallback ? "no localization: showing en, as the app would" : "draft as of last update"}
        {lockedOnFreemium && " · Premium lesson: hidden from this user, opening it shows Go Premium"}
      </p>
      <div className="min-h-0 flex-1">
        <PhoneFrame device={device} stale={previewStale}>
          {screen === "list" ? (
            suggestion.kind === "lesson" ? (
              <LessonsSheetPreview lessons={lessonRows} locale={locale} />
            ) : (
              <ChipPreview text={previewLocalization.text} />
            )
          ) : lockedOnFreemium ? (
            <div style={{ padding: 24, color: "rgba(250,250,250,0.7)", fontSize: 14, lineHeight: "20px" }}>
              This lesson requires Premium. A Freemium user does not see it in Tutorials and tapping it anywhere opens the
              Go Premium sheet.
            </div>
          ) : (
            <LessonChatPreview
              text={previewLocalization.text}
              answerMd={previewLocalization.answer_md}
              resolveImage={resolvePreviewImage}
            />
          )}
        </PhoneFrame>
      </div>
    </div>
  );

  if (wide) {
    return (
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,34%)]">
        {editor}
        {previewPanel}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabList
        label="Editor or preview"
        tabs={[
          { id: "editor", label: "Editor", badge: dirty ? <span className="text-amber-600">●</span> : null },
          { id: "preview", label: "Preview", badge: previewStale ? <span className="text-amber-600">●</span> : null },
        ]}
        value={narrowTab}
        onChange={setNarrowTab}
      />
      <TabPanel id="editor" selected={narrowTab === "editor"}>
        {editor}
      </TabPanel>
      <TabPanel id="preview" selected={narrowTab === "preview"}>
        <div className="h-[70vh]">{previewPanel}</div>
      </TabPanel>
    </div>
  );
}
