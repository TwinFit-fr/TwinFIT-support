"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bold,
  Code,
  Copy,
  Heading,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Maximize2,
  Minus,
  MoreHorizontal,
  MoveDown,
  MoveUp,
  Pilcrow,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  chunkLocaleStatus,
  editableBody,
  localeHasAnswer,
  STATUS_LABELS,
  type Chunk,
  type ChunkLocaleStatus,
} from "@/lib/coach/chunk-doc";
import { blocksOf, bodyText, isEditableBody, isTextBody, KIND_LABELS, type ChunkBody, type ChunkKind } from "@/lib/coach/chunks";
import { LOCALES, type Locale } from "@/lib/coach/types";
import { appColors, appType, Block, ListRow, type ResolveImage } from "./phone-preview";
import type { ChunkEditor } from "./use-chunk-editor";

/**
 * The answer of a lesson drawn chunk by chunk inside the phone, exactly as `AppMarkdown` draws it
 * (same blocks, same 8 dp gap), with each chunk selectable and editable in place. Everything that
 * is editor UI rather than app UI (toolbar, badges, notes, the + buttons) uses the Support
 * typeface and colours so staff can tell the two apart.
 */

type Props = {
  chunks: readonly Chunk[];
  locale: Locale;
  /** Whether the locale has a localization (chip text) at all. */
  localeExists: boolean;
  editor: ChunkEditor;
  resolveImage: ResolveImage;
  disabled?: boolean;
};

const EDITOR_FONT = "ui-sans-serif, system-ui, sans-serif";

export function ChunkAnswer({ chunks, locale, localeExists, editor, resolveImage, disabled }: Props) {
  const noOwnAnswer = locale !== "en" && !localeHasAnswer(chunks, locale);
  const selectedIndex = chunks.findIndex((chunk) => chunk.id === editor.state.selectedId);
  const insertIndex = selectedIndex >= 0 ? selectedIndex : chunks.length - 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {noOwnAnswer && chunks.length > 0 && (
        <EditorNote>
          {localeExists
            ? `No ${locale} answer yet: the app sends the chip text to the Coach instead of showing en. Edit or copy a chunk to start one.`
            : `No ${locale} localization: the app shows en. Editing a chunk here creates the ${locale} localization.`}
        </EditorNote>
      )}
      <div
        role="listbox"
        aria-label={`Answer chunks, ${locale}`}
        aria-activedescendant={editor.state.selectedId ? `chunk-${editor.state.selectedId}` : undefined}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          opacity: noOwnAnswer && localeExists && chunks.length > 0 ? 0.55 : 1,
        }}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files ?? []);
          if (files.length === 0 || disabled) return;
          event.preventDefault();
          editor.insertImagesAfter(insertIndex, files);
        }}
      >
        {chunks.map((chunk, index) => (
          <ChunkFrame
            key={chunk.id}
            chunk={chunk}
            index={index}
            count={chunks.length}
            previousId={chunks[index - 1]?.id ?? null}
            nextId={chunks[index + 1]?.id ?? null}
            locale={locale}
            editor={editor}
            resolveImage={resolveImage}
            disabled={disabled}
          />
        ))}
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={() => editor.insertAfter(chunks.length - 1, "paragraph")}
          className="rounded-md border border-dashed border-zinc-500 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-300 hover:text-white focus:outline focus:outline-2 focus:outline-amber-400"
          style={{ fontFamily: EDITOR_FONT }}
        >
          + Add a paragraph{chunks.length === 0 ? " to start the answer" : ""}
        </button>
      )}
    </div>
  );
}

function EditorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="m-0 rounded-md border border-dashed border-amber-300/60 bg-amber-300/10 px-2 py-1 text-[11px] leading-4 text-amber-100"
      style={{ fontFamily: EDITOR_FONT }}
    >
      {children}
    </p>
  );
}

// ---- One chunk ---------------------------------------------------------------------------------

type FrameProps = {
  chunk: Chunk;
  index: number;
  count: number;
  previousId: string | null;
  nextId: string | null;
  locale: Locale;
  editor: ChunkEditor;
  resolveImage: ResolveImage;
  disabled?: boolean;
};

const BADGE: Record<ChunkLocaleStatus, { label: string; className: string } | null> = {
  translated: null,
  same: { label: "= en", className: "bg-amber-400 text-amber-950" },
  missing: { label: "en", className: "bg-red-500 text-white" },
  stale: { label: "stale", className: "bg-orange-500 text-white" },
};

function ChunkFrame({ chunk, index, count, previousId, nextId, locale, editor, resolveImage, disabled }: FrameProps) {
  const { state } = editor;
  const body = editableBody(chunk, locale) ?? null;
  const fallback = body !== null && !chunk.content[locale];
  const onlyIn = LOCALES.filter((l) => chunk.content[l]);
  const selected = state.selectedId === chunk.id;
  const editing = selected && state.editingId === chunk.id && body !== null && isEditableBody(body);
  const status = chunkLocaleStatus(chunk, locale);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const focus = state.focus;
    if (!focus || focus.id !== chunk.id) return;
    const el = textareaRef.current;
    if (editing && el) {
      el.focus({ preventScroll: false });
      const length = el.value.length;
      const at = focus.caret === "end" || focus.caret === null ? length : Math.min(focus.caret, length);
      el.setSelectionRange(at, at);
    } else {
      wrapperRef.current?.focus();
    }
    editor.focusHandled(focus.token);
  }, [state.focus, editing, chunk.id, editor]);

  const badge =
    body === null
      ? { label: `only ${onlyIn.join(", ")}`, className: "bg-red-500 text-white" }
      : locale === "en"
        ? null
        : status === "same" && !isTextBody(body)
          ? null
          : BADGE[status];

  const label = `${body ? KIND_LABELS[body.kind] : "Chunk"} ${index + 1} of ${count}${
    body === null ? `, only in ${onlyIn.join(", ")}` : locale === "en" ? "" : `, ${STATUS_LABELS[status]}`
  }`;

  function onWrapperKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || disabled) return;
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      editor.move(chunk.id, event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "ArrowUp" && previousId) {
      event.preventDefault();
      editor.focusChunk(previousId);
    } else if (event.key === "ArrowDown" && nextId) {
      event.preventDefault();
      editor.focusChunk(nextId);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (body && isEditableBody(body)) editor.edit(chunk.id, "end");
      else if (body?.kind === "image") editor.openLightbox(chunk.id);
    }
  }

  function onClick(event: React.MouseEvent) {
    if (disabled) return;
    if (!body) {
      editor.select(chunk.id);
      return;
    }
    if (isEditableBody(body)) {
      if (!editing) editor.edit(chunk.id, "end");
      return;
    }
    if (body.kind === "image" && selected) {
      event.preventDefault();
      editor.openLightbox(chunk.id);
      return;
    }
    editor.focusChunk(chunk.id);
  }

  return (
    <div
      ref={wrapperRef}
      id={`chunk-${chunk.id}`}
      role="option"
      aria-selected={selected}
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
      className={cn("group relative", disabled ? "cursor-default" : "cursor-text")}
      style={{
        outline: selected ? `${editing ? "1px solid" : "1px dashed"} ${appColors.accentCyan}` : undefined,
        outlineOffset: 4,
        borderRadius: 4,
      }}
      onClick={onClick}
      onKeyDown={onWrapperKeyDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget && !selected) editor.select(chunk.id);
      }}
    >
      {!disabled && (
        <button
          type="button"
          aria-label={`Insert a paragraph before chunk ${index + 1}`}
          title="Insert a paragraph here"
          onClick={(event) => {
            event.stopPropagation();
            editor.insertAfter(index - 1, "paragraph");
          }}
          className="absolute left-1/2 z-[2] flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-zinc-200 text-sm leading-none text-zinc-900 opacity-0 shadow transition-opacity group-hover:opacity-100 focus:opacity-100 focus:outline focus:outline-2 focus:outline-amber-400"
          style={{ top: -14, fontFamily: EDITOR_FONT }}
        >
          +
        </button>
      )}

      {badge && (
        <span
          aria-hidden
          className={cn("absolute -top-2 -right-2 z-[2] rounded px-1 text-[10px] font-medium leading-4", badge.className)}
          style={{ fontFamily: EDITOR_FONT }}
        >
          {badge.label}
        </span>
      )}

      {selected && !disabled && (
        <Toolbar
          chunk={chunk}
          body={body}
          index={index}
          count={count}
          editing={editing}
          locale={locale}
          editor={editor}
          textareaRef={textareaRef}
        />
      )}

      {body === null ? (
        <GhostChunk chunk={chunk} onlyIn={onlyIn} locale={locale} editor={editor} disabled={disabled} />
      ) : editing ? (
        <ChunkTextarea
          body={body}
          textareaRef={textareaRef}
          label={`${KIND_LABELS[body.kind]} ${index + 1} text, ${locale}`}
          onChange={(text) => editor.setText(chunk.id, text)}
          onKeyDown={(event) => onTextKeyDown(event, body, chunk, editor)}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files ?? []);
            if (files.length === 0) return;
            event.preventDefault();
            event.stopPropagation();
            editor.insertImagesAfter(index, files);
          }}
          onBlur={(event) => {
            if (wrapperRef.current?.contains(event.relatedTarget as Node | null)) return;
            editor.leaveEdit();
          }}
        />
      ) : (
        <Rendered body={body} chunk={chunk} resolveImage={resolveImage} fallback={fallback} />
      )}
    </div>
  );
}

/** The chunk as the app draws it. An empty text body shows an editor placeholder instead. */
function Rendered({ body, chunk, resolveImage, fallback }: { body: ChunkBody; chunk: Chunk; resolveImage: ResolveImage; fallback: boolean }) {
  const blocks = blocksOf(body);
  if (blocks.length === 0) {
    return (
      <p className="m-0 text-xs italic text-zinc-400" style={{ fontFamily: EDITOR_FONT, lineHeight: "22px" }}>
        Empty {KIND_LABELS[body.kind].toLowerCase()}: type, or it is left out of answer_md.
      </p>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: fallback ? 0.8 : 1 }}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} resolveImage={resolveImage} imageAlign={chunk.previewAlign} />
      ))}
    </div>
  );
}

/** A chunk no locale shown here has: another locale's text that en lacks. Not app UI. */
function GhostChunk({
  chunk,
  onlyIn,
  locale,
  editor,
  disabled,
}: {
  chunk: Chunk;
  onlyIn: Locale[];
  locale: Locale;
  editor: ChunkEditor;
  disabled?: boolean;
}) {
  const source = onlyIn[0];
  const sourceBody = source ? chunk.content[source] : undefined;
  return (
    <div
      className="rounded-md border border-dashed border-red-400/70 px-2 py-1 text-[11px] leading-4 text-red-100"
      style={{ fontFamily: EDITOR_FONT }}
    >
      <p className="m-0">
        Only in {onlyIn.join(", ")}; not shown in {locale}.
        {sourceBody && <span className="ml-1 text-red-200/80">“{bodyText(sourceBody).slice(0, 60)}”</span>}
      </p>
      {!disabled && source && (
        <button
          type="button"
          className="mt-1 rounded bg-white/10 px-1.5 py-0.5 hover:bg-white/20"
          onClick={(event) => {
            event.stopPropagation();
            editor.copyFrom(chunk.id, source);
          }}
        >
          Copy from {source} into {locale}
        </button>
      )}
    </div>
  );
}

// ---- Inline text editor ------------------------------------------------------------------------

function ChunkTextarea({
  body,
  textareaRef,
  label,
  onChange,
  onKeyDown,
  onPaste,
  onBlur,
}: {
  body: ChunkBody;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  label: string;
  onChange: (text: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onBlur: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
}) {
  const value = bodyText(body);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, body.kind, textareaRef]);

  const typography: React.CSSProperties =
    body.kind === "heading"
      ? { ...(body.level === 1 ? appType.titleH3 : appType.headline), paddingTop: 4 }
      : body.kind === "code"
        ? { fontSize: 13, lineHeight: "16px", fontWeight: 400, fontFamily: "ui-monospace, monospace" }
        : appType.body;

  const field = (
    <textarea
      ref={textareaRef}
      value={value}
      rows={1}
      spellCheck
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onBlur={onBlur}
      onClick={(event) => event.stopPropagation()}
      style={{
        ...typography,
        fontFamily: body.kind === "code" ? "ui-monospace, monospace" : appColors.font,
        color: appColors.label,
        display: "block",
        width: "100%",
        minWidth: 0,
        padding: 0,
        margin: 0,
        border: "none",
        outline: "none",
        background: "transparent",
        resize: "none",
        overflow: "hidden",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
      }}
    />
  );

  if (body.kind === "bullet") return <ListRow marker="•" indent={body.indent}>{field}</ListRow>;
  if (body.kind === "numbered") return <ListRow marker={`${body.number}.`} indent={0}>{field}</ListRow>;
  if (body.kind === "code") {
    return <div style={{ background: appColors.glass, borderRadius: 12, padding: 12 }}>{field}</div>;
  }
  return field;
}

function onTextKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>, body: ChunkBody, chunk: Chunk, editor: ChunkEditor) {
  const el = event.currentTarget;
  const { selectionStart: start, selectionEnd: end, value } = el;
  const singleLine = body.kind !== "paragraph" && body.kind !== "code";

  if (event.key === "Escape") {
    event.preventDefault();
    editor.stopEditing();
  } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    event.preventDefault();
    editor.move(chunk.id, event.key === "ArrowUp" ? -1 : 1);
  } else if (event.key === "Enter") {
    const splits =
      body.kind === "code" ? event.ctrlKey || event.metaKey : singleLine || !event.shiftKey;
    if (!splits) return;
    event.preventDefault();
    editor.split(chunk.id, start, value.slice(0, start) + value.slice(end));
  } else if (event.key === "Backspace" && start === 0 && end === 0) {
    event.preventDefault();
    editor.joinPrevious(chunk.id);
  } else if (event.key === "Tab" && body.kind === "bullet") {
    event.preventDefault();
    editor.changeIndent(chunk.id, body.indent + (event.shiftKey ? -1 : 1));
  } else if ((event.ctrlKey || event.metaKey) && isTextBody(body)) {
    const key = event.key.toLowerCase();
    if (key === "b") wrapSelection(el, chunk.id, editor, "**", "bold");
    else if (key === "i") wrapSelection(el, chunk.id, editor, "*", "italic");
    else if (key === "e") wrapSelection(el, chunk.id, editor, "`", "code");
    else if (key === "k") insertLink(el, chunk.id, editor);
    else return;
    event.preventDefault();
  }
}

function wrapSelection(el: HTMLTextAreaElement, id: string, editor: ChunkEditor, marker: string, placeholder: string) {
  const { selectionStart: start, selectionEnd: end, value } = el;
  const inner = value.slice(start, end) || placeholder;
  editor.setText(id, value.slice(0, start) + marker + inner + marker + value.slice(end));
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + marker.length, start + marker.length + inner.length);
  });
}

function insertLink(el: HTMLTextAreaElement, id: string, editor: ChunkEditor) {
  const { selectionStart: start, selectionEnd: end, value } = el;
  const label = value.slice(start, end) || "link text";
  const snippet = `[${label}](https://)`;
  editor.setText(id, value.slice(0, start) + snippet + value.slice(end));
  const urlStart = start + label.length + 3;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(urlStart, urlStart + 8);
  });
}

// ---- Floating toolbar --------------------------------------------------------------------------

const INSERT_KINDS: Exclude<ChunkKind, "image">[] = ["paragraph", "heading", "bullet", "numbered", "code", "rule"];

function Toolbar({
  chunk,
  body,
  index,
  count,
  editing,
  locale,
  editor,
  textareaRef,
}: {
  chunk: Chunk;
  body: ChunkBody | null;
  index: number;
  count: number;
  editing: boolean;
  locale: Locale;
  editor: ChunkEditor;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // The toolbar unmounts with the selection, so the menu closes with it.
  const [menuOpen, setMenuOpen] = useState(false);
  const textChunk = body !== null && isTextBody(body);
  const canWrap = editing && textChunk;
  const run = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  const wrap = (marker: string, placeholder: string) => {
    const el = textareaRef.current;
    if (el) wrapSelection(el, chunk.id, editor, marker, placeholder);
  };

  const kindButton = (kind: Exclude<ChunkKind, "image">, icon: React.ReactNode, title: string) => (
    <ToolButton
      key={kind}
      label={title}
      pressed={body?.kind === kind}
      onClick={() => {
        if (kind === "heading" && body?.kind === "heading") editor.changeLevel(chunk.id, body.level >= 3 ? 1 : body.level + 1);
        else editor.changeKind(chunk.id, kind);
      }}
    >
      {icon}
    </ToolButton>
  );

  return (
    <div
      role="toolbar"
      aria-label={`Chunk ${index + 1} tools`}
      className="absolute z-[3] flex flex-wrap items-center gap-0.5 rounded-md bg-zinc-900 px-1 py-0.5 text-zinc-100 shadow-lg ring-1 ring-white/15"
      style={{ top: -34, left: -16, right: -16, fontFamily: EDITOR_FONT }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (menuOpen) setMenuOpen(false);
          else editor.stopEditing();
        }
      }}
    >
      {body && body.kind !== "image" && (
        <>
          {kindButton("paragraph", <Pilcrow className="h-3.5 w-3.5" />, "Paragraph")}
          {kindButton(
            "heading",
            <span className="flex items-center text-[11px] font-semibold">
              <Heading className="h-3.5 w-3.5" />
              {body.kind === "heading" ? body.level : ""}
            </span>,
            body.kind === "heading" ? `Heading level ${body.level} (click to cycle)` : "Heading",
          )}
          {kindButton("bullet", <List className="h-3.5 w-3.5" />, "Bullet")}
          {kindButton("numbered", <ListOrdered className="h-3.5 w-3.5" />, "Numbered item")}
          {kindButton("code", <Code className="h-3.5 w-3.5" />, "Code block")}
          {kindButton("rule", <Minus className="h-3.5 w-3.5" />, "Rule")}
          {body.kind === "bullet" && (
            <>
              <Divider />
              <ToolButton label="Outdent" disabled={body.indent <= 0} onClick={() => editor.changeIndent(chunk.id, body.indent - 1)}>
                <IndentDecrease className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton label="Indent" disabled={body.indent >= 2} onClick={() => editor.changeIndent(chunk.id, body.indent + 1)}>
                <IndentIncrease className="h-3.5 w-3.5" />
              </ToolButton>
            </>
          )}
        </>
      )}
      {textChunk && (
        <>
          <Divider />
          <ToolButton label="Bold (Ctrl+B)" disabled={!canWrap} onClick={() => wrap("**", "bold")}>
            <Bold className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Italic (Ctrl+I)" disabled={!canWrap} onClick={() => wrap("*", "italic")}>
            <Italic className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Inline code (Ctrl+E)" disabled={!canWrap} onClick={() => wrap("`", "code")}>
            <Code className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            label="Link (Ctrl+K)"
            disabled={!canWrap}
            onClick={() => {
              const el = textareaRef.current;
              if (el) insertLink(el, chunk.id, editor);
            }}
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolButton>
        </>
      )}
      {body?.kind === "image" && (
        <ToolButton label="Enlarge image" onClick={() => editor.openLightbox(chunk.id)}>
          <Maximize2 className="h-3.5 w-3.5" />
        </ToolButton>
      )}
      <span className="flex-1" />
      <ToolButton label="Move up (Alt+Up)" disabled={index === 0} onClick={() => editor.move(chunk.id, -1)}>
        <MoveUp className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton label="Move down (Alt+Down)" disabled={index === count - 1} onClick={() => editor.move(chunk.id, 1)}>
        <MoveDown className="h-3.5 w-3.5" />
      </ToolButton>
      <div className="relative">
        <ToolButton label="More actions" expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <MoreHorizontal className="h-3.5 w-3.5" />
        </ToolButton>
        {menuOpen && (
          <ul
            role="menu"
            aria-label={`Chunk ${index + 1} actions`}
            className="absolute right-0 top-full z-[4] mt-1 w-44 rounded-md bg-zinc-900 p-1 text-xs shadow-lg ring-1 ring-white/15"
          >
            <MenuItem icon={<Copy className="h-3.5 w-3.5" />} onClick={run(() => editor.duplicate(chunk.id))}>
              Duplicate
            </MenuItem>
            <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} onClick={run(() => editor.remove(chunk.id))} danger>
              Delete
            </MenuItem>
            <li role="separator" className="my-1 border-t border-white/10" />
            {INSERT_KINDS.map((kind) => (
              <MenuItem key={kind} onClick={run(() => editor.insertAfter(index, kind))}>
                Insert {KIND_LABELS[kind].toLowerCase()} after
              </MenuItem>
            ))}
            <MenuItem
              icon={<ImageIcon className="h-3.5 w-3.5" />}
              onClick={() => {
                setMenuOpen(false);
                fileRef.current?.click();
              }}
            >
              Insert image after…
            </MenuItem>
          </ul>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label={`Image files to insert after chunk ${index + 1} (${locale})`}
          onChange={(event) => {
            editor.insertImagesAfter(index, Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-white/15" />;
}

function ToolButton({
  label,
  pressed,
  expanded,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-6 min-w-6 items-center justify-center rounded px-1 hover:bg-white/15 focus:outline focus:outline-2 focus:outline-amber-400 disabled:opacity-40 disabled:hover:bg-transparent",
        pressed && "bg-white/25",
      )}
    >
      {children}
    </button>
  );
}

function MenuItem({
  icon,
  onClick,
  danger,
  children,
}: {
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/15 focus:outline focus:outline-2 focus:outline-amber-400",
          danger && "text-red-300",
        )}
      >
        {icon ?? <span className="h-3.5 w-3.5" />}
        {children}
      </button>
    </li>
  );
}
