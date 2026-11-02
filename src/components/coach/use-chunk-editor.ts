"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearLocaleBody,
  copyBody,
  deleteChunk,
  duplicateChunk,
  editableBody,
  indexOfChunk,
  insertChunk,
  joinWithPrevious,
  moveChunk,
  normalizeChunk,
  setBodyText,
  setBulletIndent,
  setHeadingLevel,
  setImageUrl,
  setKind,
  setNumber,
  setPreviewAlign,
  splitChunk,
  type ChunkDraft,
  type ImageAlign,
} from "@/lib/coach/chunk-doc";
import { convertBody, isEditableBody, type ChunkKind } from "@/lib/coach/chunks";
import { pendingUrl } from "@/lib/coach/lesson-draft";
import { altFromFileName, validateImageFile } from "@/lib/coach/media";
import { LOCALES, type Locale } from "@/lib/coach/types";

export type Caret = number | "end" | null;

/** Which chunk should take focus after the next render, and where its caret goes. */
export type FocusRequest = { id: string; caret: Caret; token: number };

export type ChunkEditorState = {
  selectedId: string | null;
  editingId: string | null;
  focus: FocusRequest | null;
  lightboxId: string | null;
};

type Params = {
  draft: ChunkDraft;
  /** Writes the next draft into the undo history; `group` merges a burst of edits into one entry. */
  commit: (next: ChunkDraft | ((present: ChunkDraft) => ChunkDraft), group?: string) => void;
  locale: Locale;
  /** Registers picked files as pending uploads and returns their pending ids. */
  onAddImages: (files: File[]) => string[];
  onImageError: (message: string) => void;
};

/**
 * Selection, edit mode and every chunk operation of the preview editor. Operations are pure
 * functions from `chunk-doc.ts` applied to the latest draft and committed to the history; the
 * hook only adds focus and selection bookkeeping on top.
 */
export function useChunkEditor({ draft, commit, locale, onAddImages, onImageError }: Params) {
  const [state, setState] = useState<ChunkEditorState>({ selectedId: null, editingId: null, focus: null, lightboxId: null });
  // The latest draft for handlers that chain several operations before React re-renders.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const token = useRef(0);

  const requestFocus = useCallback((id: string, caret: Caret): FocusRequest => ({ id, caret, token: ++token.current }), []);

  /** Every locale a chunk edit may touch: the ones with a localization, plus the one being edited. */
  const presentLocales = useCallback((d: ChunkDraft): Locale[] => {
    return LOCALES.filter((l) => d.texts[l] !== undefined || l === locale);
  }, [locale]);

  /** Edits in a locale without a localization create it (with an empty chip text Save asks for). */
  const withLocale = useCallback(
    (d: ChunkDraft): ChunkDraft => (d.texts[locale] === undefined ? { ...d, texts: { ...d.texts, [locale]: "" } } : d),
    [locale],
  );

  const select = useCallback((id: string | null) => {
    setState((s) => ({ ...s, selectedId: id, editingId: s.editingId === id ? s.editingId : null }));
  }, []);

  const edit = useCallback(
    (id: string, caret: Caret = "end") => {
      setState((s) => ({ ...s, selectedId: id, editingId: id, focus: requestFocus(id, caret) }));
    },
    [requestFocus],
  );

  /** Escape: leaves edit mode and puts focus on the chunk itself. */
  const stopEditing = useCallback(() => {
    setState((s) => ({ ...s, editingId: null, focus: s.selectedId ? requestFocus(s.selectedId, null) : null }));
  }, [requestFocus]);

  /** Focus went elsewhere (the inspector, another panel): leave edit mode without taking it back. */
  const leaveEdit = useCallback(() => setState((s) => (s.editingId ? { ...s, editingId: null } : s)), []);

  /** Selects a chunk and moves keyboard focus to it (arrow keys, the outline). */
  const focusChunk = useCallback(
    (id: string) => setState((s) => ({ ...s, selectedId: id, editingId: null, focus: requestFocus(id, null) })),
    [requestFocus],
  );

  const focusHandled = useCallback((token: number) => {
    setState((s) => (s.focus?.token === token ? { ...s, focus: null } : s));
  }, []);

  const openLightbox = useCallback((id: string | null) => setState((s) => ({ ...s, lightboxId: id })), []);

  const setText = useCallback(
    (id: string, text: string) => {
      const d = draftRef.current;
      const typed = setBodyText(d.chunks, id, locale, text);
      const normalized = normalizeChunk(typed, id, locale);
      commit(withLocale({ ...d, chunks: normalized.chunks }), normalized.changed ? undefined : `text:${id}:${locale}`);
      if (normalized.changed) edit(normalized.lastId, "end");
    },
    [commit, edit, locale, withLocale],
  );

  /** Enter: `text` (the field without its selection) is kept, split at `caret`. */
  const split = useCallback(
    (id: string, caret: number, text: string) => {
      const d = draftRef.current;
      const typed = setBodyText(d.chunks, id, locale, text);
      const result = splitChunk(typed, id, locale, caret);
      if (!result) return;
      commit(withLocale({ ...d, chunks: result.chunks }));
      edit(result.id, 0);
    },
    [commit, edit, locale, withLocale],
  );

  const joinPrevious = useCallback(
    (id: string) => {
      const d = draftRef.current;
      const result = joinWithPrevious(d.chunks, id, locale);
      if (!result) return;
      commit(withLocale({ ...d, chunks: result.chunks }));
      if (result.caret === null) {
        setState((s) => ({ ...s, selectedId: result.id, editingId: null, focus: requestFocus(result.id, null) }));
      } else {
        edit(result.id, result.caret);
      }
    },
    [commit, edit, locale, requestFocus, withLocale],
  );

  const insertAfter = useCallback(
    (afterIndex: number, kind: Exclude<ChunkKind, "image">) => {
      const d = draftRef.current;
      const previous = d.chunks[afterIndex];
      const body = convertBody({ kind: "paragraph", text: "" }, kind, previous ? editableBody(previous, locale) : undefined);
      const result = insertChunk(d.chunks, afterIndex, body, locale, presentLocales(d));
      commit(withLocale({ ...d, chunks: result.chunks }));
      if (isEditableBody(body)) edit(result.id, 0);
      else setState((s) => ({ ...s, selectedId: result.id, editingId: null, focus: requestFocus(result.id, null) }));
    },
    [commit, edit, locale, presentLocales, requestFocus, withLocale],
  );

  const acceptImages = useCallback(
    (files: File[]): File[] => {
      const accepted: File[] = [];
      for (const file of files) {
        const problem = validateImageFile(file);
        if (problem) onImageError(problem);
        else accepted.push(file);
      }
      return accepted;
    },
    [onImageError],
  );

  const insertImagesAfter = useCallback(
    (afterIndex: number, files: File[]) => {
      const accepted = acceptImages(files);
      if (accepted.length === 0) return;
      const ids = onAddImages(accepted);
      const d = draftRef.current;
      let chunks = d.chunks;
      let lastId: string | null = null;
      let at = afterIndex;
      ids.forEach((pendingId, index) => {
        const body = { kind: "image" as const, alt: altFromFileName(accepted[index].name), url: pendingUrl(pendingId) };
        const result = insertChunk(chunks, at, body, locale, presentLocales(d));
        chunks = result.chunks;
        lastId = result.id;
        at++;
      });
      commit(withLocale({ ...d, chunks }));
      if (lastId) setState((s) => ({ ...s, selectedId: lastId, editingId: null, focus: requestFocus(lastId!, null) }));
    },
    [acceptImages, commit, locale, onAddImages, presentLocales, requestFocus, withLocale],
  );

  /** Swaps the picture of an image chunk for a new pending file; every locale shows the new one. */
  const replaceImage = useCallback(
    (id: string, file: File) => {
      const [accepted] = acceptImages([file]);
      if (!accepted) return;
      const [pendingId] = onAddImages([accepted]);
      commit((d) => ({ ...d, chunks: setImageUrl(d.chunks, id, pendingUrl(pendingId)) }));
    },
    [acceptImages, commit, onAddImages],
  );

  /** Swaps the picture for one already in the library (a Storage URL; nothing to upload on Save). */
  const replaceImageUrl = useCallback(
    (id: string, url: string) => commit((d) => ({ ...d, chunks: setImageUrl(d.chunks, id, url) })),
    [commit],
  );

  /** Inserts an image chunk for a library file; shared by every locale like a dropped image. */
  const insertImageUrl = useCallback(
    (afterIndex: number, url: string, alt: string) => {
      const d = draftRef.current;
      const result = insertChunk(d.chunks, afterIndex, { kind: "image", alt, url }, locale, presentLocales(d));
      commit(withLocale({ ...d, chunks: result.chunks }));
      setState((s) => ({ ...s, selectedId: result.id, editingId: null, focus: requestFocus(result.id, null) }));
    },
    [commit, locale, presentLocales, requestFocus, withLocale],
  );

  const move = useCallback(
    (id: string, delta: number) => commit((d) => ({ ...d, chunks: moveChunk(d.chunks, id, delta) })),
    [commit],
  );

  const duplicate = useCallback(
    (id: string) => {
      const d = draftRef.current;
      const result = duplicateChunk(d.chunks, id);
      commit({ ...d, chunks: result.chunks });
      setState((s) => ({ ...s, selectedId: result.id, editingId: null, focus: requestFocus(result.id, null) }));
    },
    [commit, requestFocus],
  );

  const remove = useCallback(
    (id: string) => {
      const d = draftRef.current;
      const index = indexOfChunk(d.chunks, id);
      const neighbour = d.chunks[index + 1] ?? d.chunks[index - 1] ?? null;
      commit({ ...d, chunks: deleteChunk(d.chunks, id) });
      setState((s) => ({
        ...s,
        selectedId: neighbour?.id ?? null,
        editingId: null,
        focus: neighbour ? requestFocus(neighbour.id, null) : null,
      }));
    },
    [commit, requestFocus],
  );

  const changeKind = useCallback(
    (id: string, kind: Exclude<ChunkKind, "image">) => {
      commit((d) => ({ ...d, chunks: setKind(d.chunks, id, kind) }));
      if (kind === "rule") setState((s) => ({ ...s, editingId: null }));
    },
    [commit],
  );

  const changeLevel = useCallback(
    (id: string, level: number) => commit((d) => ({ ...d, chunks: setHeadingLevel(d.chunks, id, level) })),
    [commit],
  );
  const changeIndent = useCallback(
    (id: string, indent: number) => commit((d) => ({ ...d, chunks: setBulletIndent(d.chunks, id, indent) })),
    [commit],
  );
  const changeNumber = useCallback(
    (id: string, number: number) => commit((d) => ({ ...d, chunks: setNumber(d.chunks, id, number) })),
    [commit],
  );
  const changeAlign = useCallback(
    (id: string, align: ImageAlign) => commit((d) => ({ ...d, chunks: setPreviewAlign(d.chunks, id, align) })),
    [commit],
  );
  const setAlt = useCallback(
    (id: string, alt: string) => commit((d) => withLocale({ ...d, chunks: setBodyText(d.chunks, id, locale, alt) }), `alt:${id}:${locale}`),
    [commit, locale, withLocale],
  );
  /** Copies another locale's body into the current one (usually en, to seed a translation). */
  const copyFrom = useCallback(
    (id: string, from: Locale) => commit((d) => withLocale({ ...d, chunks: copyBody(d.chunks, id, from, locale) })),
    [commit, locale, withLocale],
  );
  const clearLocale = useCallback(
    (id: string) => commit((d) => ({ ...d, chunks: clearLocaleBody(d.chunks, id, locale) })),
    [commit, locale],
  );

  return useMemo(
    () => ({
      state,
      select,
      edit,
      stopEditing,
      leaveEdit,
      focusChunk,
      focusHandled,
      openLightbox,
      setText,
      split,
      joinPrevious,
      insertAfter,
      insertImagesAfter,
      insertImageUrl,
      replaceImage,
      replaceImageUrl,
      move,
      duplicate,
      remove,
      changeKind,
      changeLevel,
      changeIndent,
      changeNumber,
      changeAlign,
      setAlt,
      copyFrom,
      clearLocale,
    }),
    [
      state,
      select,
      edit,
      stopEditing,
      leaveEdit,
      focusChunk,
      focusHandled,
      openLightbox,
      setText,
      split,
      joinPrevious,
      insertAfter,
      insertImagesAfter,
      insertImageUrl,
      replaceImage,
      replaceImageUrl,
      move,
      duplicate,
      remove,
      changeKind,
      changeLevel,
      changeIndent,
      changeNumber,
      changeAlign,
      setAlt,
      copyFrom,
      clearLocale,
    ],
  );
}

export type ChunkEditor = ReturnType<typeof useChunkEditor>;
