"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bold,
  Code,
  Heading,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Trash2,
} from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  findImages,
  imageMarkdown,
  insertBlockAt,
  lintMarkdown,
  removeImage,
  replaceImage,
  type MdImage,
} from "@/lib/coach/markdown";
import { pendingIdFromUrl } from "@/lib/coach/lesson-draft";
import { ANSWER_MD_MAX, COACH_MEDIA_MAX_BYTES } from "@/lib/coach/types";

/** An image picked in the editor and not uploaded yet; `objectUrl` previews it locally. */
export type PendingImage = { id: string; file: File; objectUrl: string };

/** Checks a picked file before it enters the draft; returns the error to show, or null. */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return `${file.name || "This file"} is not an image. Only image files can be embedded.`;
  }
  if (file.size > COACH_MEDIA_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `${file.name || "This image"} is ${mb} MB; the limit is ${COACH_MEDIA_MAX_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Called when the person pauses: blur, or an action that changed the text structurally. */
  onSettle: () => void;
  /** Files dropped, pasted or picked; the host registers them and returns their pending ids. */
  onAddImages: (files: File[]) => string[];
  pending: ReadonlyMap<string, PendingImage>;
  onImageError: (message: string) => void;
  disabled?: boolean;
  id?: string;
};

const textareaClass =
  "min-h-[8rem] w-full flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] leading-5 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400";

/**
 * The answer_md editor: a textarea with a toolbar limited to the app's markdown subset, a
 * counter, warnings for markup the app will not render, and the images referenced in the text.
 */
export function MarkdownEditor({
  value,
  onChange,
  onSettle,
  onAddImages,
  pending,
  onImageError,
  disabled,
  id,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const warningsId = useId();
  const warnings = useMemo(() => lintMarkdown(value), [value]);
  const images = useMemo(() => findImages(value), [value]);
  const over = value.length > ANSWER_MD_MAX;

  /** Applies `edit` to the current selection and restores the caret after React re-renders. */
  function edit(fn: (text: string, start: number, end: number) => { text: string; start: number; end: number }) {
    const el = ref.current;
    if (!el) return;
    const { text, start, end } = fn(value, el.selectionStart, el.selectionEnd);
    onChange(text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, end);
    });
  }

  function wrap(marker: string, placeholder: string) {
    edit((text, start, end) => {
      const selected = text.slice(start, end);
      const inner = selected || placeholder;
      const next = text.slice(0, start) + marker + inner + marker + text.slice(end);
      return { text: next, start: start + marker.length, end: start + marker.length + inner.length };
    });
  }

  function prefixLines(prefix: (index: number) => string) {
    edit((text, start, end) => {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const lineEndIndex = text.indexOf("\n", end);
      const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
      const block = text.slice(lineStart, lineEnd);
      const lines = block.split("\n").map((line, index) => prefix(index) + line.replace(/^(\s*)([-*•]\s+|\d{1,3}[.)]\s+|#{1,3}\s+)/, "$1"));
      const replaced = lines.join("\n");
      return { text: text.slice(0, lineStart) + replaced + text.slice(lineEnd), start: lineStart, end: lineStart + replaced.length };
    });
  }

  function heading() {
    edit((text, start, end) => {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const lineEndIndex = text.indexOf("\n", start);
      const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
      const line = text.slice(lineStart, lineEnd);
      const match = line.match(/^(#{1,3})\s+(.*)$/);
      const level = match ? match[1].length : 0;
      const body = match ? match[2] : line;
      const next = level >= 3 ? body : `${"#".repeat(level + 1)} ${body}`;
      const delta = next.length - line.length;
      return { text: text.slice(0, lineStart) + next + text.slice(lineEnd), start: start + delta, end: end + delta };
    });
  }

  function link() {
    edit((text, start, end) => {
      const selected = text.slice(start, end) || "link text";
      const snippet = `[${selected}](https://)`;
      const urlStart = start + selected.length + 3;
      return { text: text.slice(0, start) + snippet + text.slice(end), start: urlStart, end: urlStart + 8 };
    });
  }

  function code() {
    edit((text, start, end) => {
      const selected = text.slice(start, end);
      if (selected.includes("\n")) {
        const { text: next, caret } = insertBlockAt(text, start, end, "```\n" + selected + "\n```");
        return { text: next, start: caret, end: caret };
      }
      const inner = selected || "code";
      return { text: text.slice(0, start) + "`" + inner + "`" + text.slice(end), start: start + 1, end: start + 1 + inner.length };
    });
  }

  function pickImage() {
    fileInputRef.current?.click();
  }

  function addFiles(files: File[]) {
    const accepted: File[] = [];
    for (const file of files) {
      const problem = validateImageFile(file);
      if (problem) onImageError(problem);
      else accepted.push(file);
    }
    if (accepted.length === 0) return;
    const ids = onAddImages(accepted);
    edit((text, start, end) => {
      const snippet = ids
        .map((pendingId, index) => imageMarkdown(accepted[index].name.replace(/\.[^.]+$/, ""), `pending:${pendingId}`))
        .join("\n\n");
      const { text: next, caret } = insertBlockAt(text, start, end, snippet);
      return { text: next, start: caret, end: caret };
    });
    onSettle();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      wrap("**", "bold");
    } else if (key === "i") {
      event.preventDefault();
      wrap("*", "italic");
    } else if (key === "k") {
      event.preventDefault();
      link();
    } else if (key === "e") {
      event.preventDefault();
      code();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Formatting">
        <ToolButton label="Heading" title="Heading (cycles #, ##, ###)" disabled={disabled} onClick={heading}>
          <Heading className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Bold" title="Bold (Ctrl+B)" disabled={disabled} onClick={() => wrap("**", "bold")}>
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Italic" title="Italic (Ctrl+I)" disabled={disabled} onClick={() => wrap("*", "italic")}>
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Bullet list" title="Bullet list" disabled={disabled} onClick={() => prefixLines(() => "- ")}>
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          title="Numbered list"
          disabled={disabled}
          onClick={() => prefixLines((i) => `${i + 1}. `)}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Link" title="Link (Ctrl+K)" disabled={disabled} onClick={link}>
          <LinkIcon className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Code"
          title="Code (Ctrl+E): inline, or a fenced block for a multi-line selection"
          disabled={disabled}
          onClick={code}
        >
          <Code className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Image"
          title="Insert an image at the cursor (also drag-and-drop or paste)"
          disabled={disabled}
          onClick={pickImage}
        >
          <ImageIcon className="h-4 w-4" />
        </ToolButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <span className={cn("ml-auto text-xs tabular-nums", over ? "font-medium text-red-600" : "text-zinc-500")}>
          {value.length.toLocaleString()}/{ANSWER_MD_MAX.toLocaleString()}
          {over && " · over the limit"}
        </span>
      </div>

      <textarea
        ref={ref}
        id={id}
        className={cn(textareaClass, dragging && "border-zinc-500 ring-1 ring-zinc-400", over && "border-red-400")}
        value={value}
        disabled={disabled}
        spellCheck
        aria-invalid={over || undefined}
        aria-describedby={warnings.length ? warningsId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onSettle}
        onKeyDown={onKeyDown}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files ?? []);
          if (files.length === 0) return;
          event.preventDefault();
          addFiles(files);
        }}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.types).includes("Files")) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          setDragging(false);
          const files = Array.from(event.dataTransfer.files ?? []);
          if (files.length === 0) return;
          event.preventDefault();
          addFiles(files);
        }}
      />

      {warnings.length > 0 && (
        <div id={warningsId} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="mb-1 flex items-center gap-1 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> The app will not render this as written
          </p>
          <ul className="max-h-24 space-y-0.5 overflow-auto">
            {warnings.map((warning, index) => (
              <li key={index}>
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={() => focusLine(ref.current, value, warning.line)}
                >
                  Line {warning.line}
                </button>
                : {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {images.length > 0 && (
        <ImagesPanel
          images={images}
          pending={pending}
          disabled={disabled}
          onAlt={(image, alt) => {
            onChange(replaceImage(value, image, { alt }));
          }}
          onRemove={(image) => {
            onChange(removeImage(value, image));
            onSettle();
          }}
        />
      )}
    </div>
  );
}

function ToolButton({
  label,
  title,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-8 px-2"
      title={title}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function focusLine(el: HTMLTextAreaElement | null, text: string, line: number) {
  if (!el) return;
  const lines = text.split("\n");
  const start = lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0);
  const end = start + (lines[line - 1]?.length ?? 0);
  el.focus();
  el.setSelectionRange(start, end);
}

function ImagesPanel({
  images,
  pending,
  disabled,
  onAlt,
  onRemove,
}: {
  images: MdImage[];
  pending: ReadonlyMap<string, PendingImage>;
  disabled?: boolean;
  onAlt: (image: MdImage, alt: string) => void;
  onRemove: (image: MdImage) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Images in this answer ({images.length})
      </p>
      <p className="mb-2 text-xs text-zinc-600">
        Pending images are uploaded to <code>coach-media</code> when you press Save; images removed
        before saving never reach Storage. The app does not render images yet (ClickUp 123m57f5drw), so
        users see the alt text as a link.
      </p>
      <ul className="max-h-40 space-y-2 overflow-auto">
        {images.map((image, index) => {
          const pendingId = pendingIdFromUrl(image.url);
          const local = pendingId ? pending.get(pendingId) : undefined;
          const src = local?.objectUrl ?? (pendingId ? null : image.url);
          return (
            <li key={`${image.start}-${index}`} className="flex items-center gap-2">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- storage and blob URLs, no optimisation
                <img src={src} alt="" className="h-12 w-12 shrink-0 rounded border border-zinc-200 bg-white object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-dashed border-zinc-300 text-[10px] text-zinc-400">
                  missing
                </span>
              )}
              <div className="min-w-0 flex-1">
                <Input
                  aria-label={`Alt text for image ${index + 1}`}
                  value={image.alt}
                  placeholder="Alt text"
                  disabled={disabled}
                  className="h-8 py-1"
                  onChange={(event) => onAlt(image, event.target.value)}
                />
                <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={image.url}>
                  {pendingId ? (
                    <span className="font-medium text-amber-700">pending upload · {local?.file.name ?? "file missing"}</span>
                  ) : (
                    image.url
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2"
                aria-label={`Remove image ${index + 1}`}
                title="Remove this image from the answer"
                disabled={disabled}
                onClick={() => onRemove(image)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
