"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { TabList, TabPanel } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useHistory } from "@/hooks/use-history";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { cn } from "@/lib/utils";
import {
  canonicalLesson,
  chunkDraftFromLesson,
  imageChunks,
  lessonFromChunkDraft,
  localeSummary,
  removeLocale as removeLocaleFromDraft,
  replacePendingUrls,
  type ChunkDraft,
} from "@/lib/coach/chunk-doc";
import { isAllowedImageUrl } from "@/lib/coach/markdown";
import {
  changedLocales,
  draftFromSuggestion,
  isDirty,
  localeStatus,
  pendingIdFromUrl,
  planSave,
  storageFileId,
  urlReferencedElsewhere,
  validateDraft,
  type LessonDraft,
} from "@/lib/coach/lesson-draft";
import { suggestionFolder, type PendingImage } from "@/lib/coach/media";
import { ANSWER_MD_MAX, LOCALES, SUGGESTION_TEXT_MAX, type Locale, type Suggestion } from "@/lib/coach/types";
import { ChunkAnswer } from "./chunk-preview";
import { ChunkInspector, type LibraryTarget } from "./chunk-inspector";
import { ImageLightbox } from "./image-lightbox";
import { MediaLibraryDialog } from "./media-library";
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
import { useChunkEditor } from "./use-chunk-editor";

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
type NarrowTab = "preview" | "document" | "chunk";

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
 * Editor and phone preview for one suggestion. The phone is the editor: the answer is a list of
 * chunks edited in place, in the locale shown. The draft is local and `Save` is the only write;
 * `answer_md` per locale is derived from the chunks when Save runs (see `chunk-doc.ts`).
 */
export function SuggestionWorkspace({ suggestion, suggestions, onDirtyChange, onSaved, onDelete, busy }: Props) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const confirm = useConfirm();
  const [base, setBase] = useState<LessonDraft>(() => canonicalLesson(draftFromSuggestion(suggestion)));
  const [initialDraft] = useState<ChunkDraft>(() => chunkDraftFromLesson(base));
  const history = useHistory<ChunkDraft>(initialDraft);
  const draft = history.value;
  const lesson = useMemo(() => lessonFromChunkDraft(draft), [draft]);
  const [locale, setLocale] = useState<Locale>("en");
  const [pending, setPending] = useState<Map<string, PendingImage>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const [device, setDevice] = usePreviewDevice();
  const [viewer, setViewer] = useState<Viewer>("premium");
  const [screen, setScreen] = useState<Screen>("lesson");
  const [lessonState, setLessonState] = useState<PreviewLessonState>("available");
  const [narrowTab, setNarrowTab] = useState<NarrowTab>("preview");
  const [library, setLibrary] = useState<LibraryTarget | null>(null);
  const wide = useMediaQuery("(min-width: 1024px)");
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const dirty = useMemo(() => isDirty(base, lesson), [base, lesson]);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // A fresh suggestion from the server (after Save, or a list refresh) replaces the base unless
  // there are local edits; those keep their base until they are saved or discarded.
  const resetHistory = history.reset;
  useEffect(() => {
    if (dirtyRef.current) return;
    const next = canonicalLesson(draftFromSuggestion(suggestion));
    setBase(next);
    resetHistory(chunkDraftFromLesson(next));
  }, [suggestion, resetHistory]);

  const plan = useMemo(() => planSave(base, lesson), [base, lesson]);
  const problems = useMemo(() => validateDraft(lesson), [lesson]);
  const changed = useMemo(() => new Set(changedLocales(base, lesson)), [base, lesson]);
  const folder = suggestionFolder(suggestion.kind, suggestion.slug);

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

  const addImages = useCallback((files: File[]): string[] => {
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
  }, []);

  const onImageError = useCallback((message: string) => toast.error(message, "Image not added"), [toast]);

  const editor = useChunkEditor({ draft, commit: history.commit, locale, onAddImages: addImages, onImageError });

  /** Pending uploads preview from their local copy; saved ones load like the app would. */
  const resolvePreviewImage = useCallback(
    (url: string) => {
      const pendingId = pendingIdFromUrl(url);
      if (pendingId) return pending.get(pendingId)?.objectUrl ?? null;
      return isAllowedImageUrl(url, APP_IMAGE_HOSTS) ? url : null;
    },
    [pending],
  );

  const setText = (loc: Locale, text: string) =>
    history.commit((d) => ({ ...d, texts: { ...d.texts, [loc]: text } }), `chip:${loc}`);
  const setMeta = (patch: Partial<ChunkDraft>) => history.commit((d) => ({ ...d, ...patch }));

  async function discard() {
    if (!dirty) return;
    const ok = await confirm({
      title: "Discard unsaved changes?",
      description: `Edits to ${plan.summary.join(", ")} will be lost. Pending images are dropped without uploading.`,
      confirmLabel: "Discard",
      variant: "danger",
    });
    if (!ok) return;
    history.reset(chunkDraftFromLesson(base));
    clearPending();
  }

  async function save() {
    if (!dirty || problems.length > 0 || saving) return;
    setSaving(true);
    const uploaded: { id: string; url: string }[] = [];
    try {
      // 1. Upload the pending images the localizations being saved reference, into this
      //    suggestion's folder, then swap the placeholders for Storage URLs in every locale.
      const urls = new Map<string, string>();
      for (const pendingId of plan.uploads) {
        const image = pending.get(pendingId);
        if (!image) throw new Error("A pending image is missing; remove it from the answer and retry.");
        const result = (await staffFetch("/api/coach/media", {
          method: "POST",
          body: JSON.stringify({
            mimeType: image.file.type || "image/png",
            data: await readFileAsBase64(image.file),
            folder,
            fileName: image.file.name,
          }),
        })) as { id: string; url: string };
        uploaded.push(result);
        urls.set(pendingId, result.url);
      }
      const savedDraft: ChunkDraft = { ...draft, chunks: replacePendingUrls(draft.chunks, urls) };
      const toSave = lessonFromChunkDraft(savedDraft);

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

      // 3. Files this suggestion uploaded for itself and stopped referencing are removed, unless
      //    another suggestion uses them. Library images in other folders are always kept.
      let orphanFailures = 0;
      for (const url of finalPlan.droppedUrls) {
        const fileId = storageFileId(url);
        if (!fileId || urlReferencedElsewhere(suggestions, suggestion.id, url)) continue;
        try {
          await staffFetch(`/api/coach/media?id=${encodeURIComponent(fileId)}&under=${encodeURIComponent(folder)}`, {
            method: "DELETE",
          });
        } catch {
          orphanFailures++;
        }
      }

      setBase(toSave);
      history.reset(savedDraft);
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Undo/redo for the whole draft. Native undo in plain inputs (chip text, alt) is left alone. */
  function onRootKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT") return;
    const key = event.key.toLowerCase();
    if (key === "z" && event.shiftKey) {
      event.preventDefault();
      history.redo();
    } else if (key === "z") {
      event.preventDefault();
      history.undo();
    } else if (key === "y") {
      event.preventDefault();
      history.redo();
    }
  }

  async function removeLocale(loc: Locale) {
    if (loc === "en") return;
    const ok = await confirm({
      title: `Remove the ${loc} localization?`,
      description: `Its chip text and every ${loc} chunk are dropped; the backend row is deleted when you press Save.`,
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    history.commit((d) => removeLocaleFromDraft(d, loc));
  }

  // ---- Preview data ----------------------------------------------------------------------------

  const localeExists = draft.texts[locale] !== undefined;
  const previewText = draft.texts[locale] ?? draft.texts.en ?? "";
  const lockedOnFreemium = viewer === "freemium" && (draft.requires_personal_data || draft.requires_plan_builder);
  const selectedIndex = draft.chunks.findIndex((chunk) => chunk.id === editor.state.selectedId);
  const insertIndex = selectedIndex >= 0 ? selectedIndex : draft.chunks.length - 1;

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
            active: lesson.active,
            requires_personal_data: lesson.requires_personal_data,
            requires_plan_builder: lesson.requires_plan_builder,
            unlocks_after: lesson.unlocks_after.trim() || null,
            sort_order: lesson.sort_order,
            localizations: LOCALES.flatMap((loc) => {
              const entry = lesson.localizations[loc];
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
  }, [suggestions, suggestion.id, lesson, locale, viewer, lessonState]);

  const prerequisite = suggestions.find((row) => row.slug === draft.unlocks_after.trim());
  const sectionSiblings = suggestions.filter(
    (row) => row.kind === suggestion.kind && (row.section_slug ?? "") === draft.section_slug.trim(),
  );

  const lightboxImage = useMemo(() => {
    const id = editor.state.lightboxId;
    if (!id) return null;
    const image = imageChunks(draft.chunks, locale).find((i) => i.id === id);
    if (!image) return null;
    return { src: resolvePreviewImage(image.url) ?? image.url, alt: image.alt };
  }, [editor.state.lightboxId, draft.chunks, locale, resolvePreviewImage]);

  // ---- Render ----------------------------------------------------------------------------------

  const header = (
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
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" className="h-8 px-2" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.canUndo || saving} onClick={history.undo}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" className="h-8 px-2" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo || saving} onClick={history.redo}>
            <Redo2 className="h-4 w-4" />
          </Button>
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
    </Card>
  );

  const documentRail = (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      <Card className="py-3 text-sm">
        <details>
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
          <div className="mt-2 grid gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.active} onChange={(e) => setMeta({ active: e.target.checked })} />
              Active
            </label>
            <label className="flex items-center gap-2" title="Premium: hidden from Freemium users">
              <input
                type="checkbox"
                checked={draft.requires_personal_data}
                onChange={(e) => setMeta({ requires_personal_data: e.target.checked })}
              />
              Requires personal data
            </label>
            <label className="flex items-center gap-2" title="Premium: hidden from Freemium users">
              <input
                type="checkbox"
                checked={draft.requires_plan_builder}
                onChange={(e) => setMeta({ requires_plan_builder: e.target.checked })}
              />
              Requires plan builder
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Section slug</span>
              <Input value={draft.section_slug} onChange={(e) => setMeta({ section_slug: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Sort order</span>
              <Input
                type="number"
                value={Number.isFinite(draft.sort_order) ? draft.sort_order : ""}
                onChange={(e) => setMeta({ sort_order: e.target.value === "" ? NaN : Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Unlocks after (lesson slug)</span>
              <Input list="coach-lesson-slugs" value={draft.unlocks_after} onChange={(e) => setMeta({ unlocks_after: e.target.value })} />
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
              : "No prerequisite: available as soon as the user opens Tutorials."}{" "}
            {sectionSiblings.length > 1 &&
              `Position ${sectionSiblings.filter((row) => row.id !== suggestion.id && row.sort_order < draft.sort_order).length + 1} of ${sectionSiblings.length} in this section.`}
          </p>
        </details>
      </Card>

      <Card className="space-y-2 py-3">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Locale">
          {LOCALES.map((item) => {
            const status = localeStatus(lesson, item);
            const summary = localeSummary(draft.chunks, item);
            const attention = item === "en" ? summary.missing : summary.missing + summary.stale + summary.same;
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
                      : attention > 0
                        ? `${attention} chunk(s) need attention`
                        : "Complete"
                }
              >
                {item}
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    status === "missing" ? "bg-red-400" : status === "no-answer" || attention > 0 ? "bg-amber-400" : "bg-emerald-400",
                  )}
                />
                {changed.has(item) && <span className="text-[10px] opacity-80">●</span>}
              </button>
            );
          })}
          {locale !== "en" && localeExists && (
            <Button type="button" variant="ghost" className="ml-auto h-7 px-2 text-xs" disabled={saving} onClick={() => removeLocale(locale)}>
              Remove {locale}
            </Button>
          )}
        </div>

        {!localeExists && (
          <p className="rounded-md bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
            No {locale} localization. Type a chip text (or edit a chunk) to create it on Save; the app falls back to en meanwhile.
          </p>
        )}

        <label className="block text-sm">
          <span className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>Chip text (lesson title)</span>
            <span className={cn("tabular-nums", (draft.texts[locale] ?? "").length > SUGGESTION_TEXT_MAX && "font-medium text-red-600")}>
              {(draft.texts[locale] ?? "").length}/{SUGGESTION_TEXT_MAX}
            </span>
          </span>
          <Input
            value={draft.texts[locale] ?? ""}
            aria-invalid={(draft.texts[locale] ?? "").length > SUGGESTION_TEXT_MAX || undefined}
            className={cn((draft.texts[locale] ?? "").length > SUGGESTION_TEXT_MAX && "border-red-400")}
            disabled={saving}
            onChange={(e) => setText(locale, e.target.value)}
          />
        </label>

        <LocaleSummary draft={draft} lesson={lesson} locale={locale} />

        <details className="text-xs">
          <summary className="cursor-pointer select-none text-zinc-600">answer_md · {locale} (what Save writes)</summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-zinc-50 p-2 text-[11px] whitespace-pre-wrap break-words">
            {lesson.localizations[locale]?.answer_md || "(empty)"}
          </pre>
        </details>
      </Card>
    </div>
  );

  const preview = (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select aria-label="Device" className="rounded-md border border-zinc-300 bg-white px-2 py-1" value={device.id} onChange={(e) => setDevice(e.target.value)}>
          {PREVIEW_DEVICES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <select aria-label="Screen" className="rounded-md border border-zinc-300 bg-white px-2 py-1" value={screen} onChange={(e) => setScreen(e.target.value as Screen)}>
          <option value="lesson">{suggestion.kind === "lesson" ? "Lesson opened" : "Chip + answer"}</option>
          <option value="list">{suggestion.kind === "lesson" ? "Tutorials list" : "Chip in empty state"}</option>
        </select>
        <select aria-label="Viewer tier" className="rounded-md border border-zinc-300 bg-white px-2 py-1" value={viewer} onChange={(e) => setViewer(e.target.value as Viewer)}>
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
        <span className="ml-auto text-zinc-500">
          {locale}
          {!localeExists && " · no localization: showing en, as the app would"}
          {lockedOnFreemium && " · Premium: hidden from this user"}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <PhoneFrame device={device} onDropFiles={saving ? undefined : (files) => editor.insertImagesAfter(insertIndex, files)}>
          {screen === "list" ? (
            suggestion.kind === "lesson" ? (
              <LessonsSheetPreview lessons={lessonRows} locale={locale} />
            ) : (
              <ChipPreview text={previewText} />
            )
          ) : lockedOnFreemium ? (
            <div style={{ padding: 24, color: "rgba(250,250,250,0.7)", fontSize: 14, lineHeight: "20px" }}>
              This lesson requires Premium. A Freemium user does not see it in Tutorials and tapping it anywhere opens the Go
              Premium sheet.
            </div>
          ) : (
            <LessonChatPreview text={previewText} answerMd="" resolveImage={resolvePreviewImage}>
              <ChunkAnswer
                chunks={draft.chunks}
                locale={locale}
                localeExists={localeExists}
                editor={editor}
                resolveImage={resolvePreviewImage}
                disabled={saving}
              />
            </LessonChatPreview>
          )}
        </PhoneFrame>
      </div>
    </div>
  );

  const inspector = (
    <ChunkInspector
      draft={draft}
      locale={locale}
      editor={editor}
      resolveImage={resolvePreviewImage}
      disabled={saving}
      onOpenLibrary={setLibrary}
    />
  );

  const overlays = (
    <>
      {lightboxImage && <ImageLightbox src={lightboxImage.src} alt={lightboxImage.alt} onClose={() => editor.openLightbox(null)} />}
      {library && (
        <MediaLibraryDialog
          suggestions={suggestions}
          defaultFolder={folder}
          mode={library.mode}
          onClose={() => setLibrary(null)}
          onPick={(file) => {
            if (library.mode === "insert") editor.insertImageUrl(library.afterIndex, file.url, file.alt);
            else editor.replaceImageUrl(library.id, file.url);
            setLibrary(null);
          }}
        />
      )}
    </>
  );

  if (wide) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3" onKeyDown={onRootKeyDown}>
        {header}
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(220px,24%)_minmax(0,1fr)_minmax(260px,27%)]">
          {documentRail}
          {preview}
          {inspector}
        </div>
        {overlays}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" onKeyDown={onRootKeyDown}>
      {header}
      <TabList
        label="Preview, document or chunk"
        tabs={[
          { id: "preview", label: "Preview", badge: dirty ? <span className="text-amber-600">●</span> : null },
          { id: "document", label: "Document", badge: null },
          { id: "chunk", label: "Chunk", badge: null },
        ]}
        value={narrowTab}
        onChange={setNarrowTab}
      />
      <TabPanel id="preview" selected={narrowTab === "preview"}>
        <div className="h-[75vh]">{preview}</div>
      </TabPanel>
      <TabPanel id="document" selected={narrowTab === "document"}>
        {documentRail}
      </TabPanel>
      <TabPanel id="chunk" selected={narrowTab === "chunk"}>
        {inspector}
      </TabPanel>
      {overlays}
    </div>
  );
}

/** How far a locale's chunks are, and how long its answer is. */
function LocaleSummary({ draft, lesson, locale }: { draft: ChunkDraft; lesson: LessonDraft; locale: Locale }) {
  const summary = localeSummary(draft.chunks, locale);
  const length = lesson.localizations[locale]?.answer_md.length ?? 0;
  const over = length > ANSWER_MD_MAX;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
      <span>
        {summary.total} chunk{summary.total === 1 ? "" : "s"}
      </span>
      {locale !== "en" && (
        <>
          <span className="text-emerald-700">{summary.translated} translated</span>
          {summary.same > 0 && <span className="text-amber-700">{summary.same} same as en</span>}
          {summary.stale > 0 && <span className="text-orange-700">{summary.stale} stale</span>}
          {summary.missing > 0 && <span className="text-red-700">{summary.missing} missing (shows en)</span>}
        </>
      )}
      {locale === "en" && summary.missing > 0 && <span className="text-red-700">{summary.missing} only in another locale</span>}
      <span className={cn("ml-auto tabular-nums", over ? "font-medium text-red-600" : "text-zinc-500")}>
        answer_md {length.toLocaleString()}/{ANSWER_MD_MAX.toLocaleString()}
        {over && " · over the limit"}
      </span>
    </div>
  );
}
