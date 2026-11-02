"use client";

import { useMemo, useRef } from "react";
import { AlertTriangle, Copy, Image as ImageIcon, Maximize2, MoveDown, MoveUp, Trash2 } from "lucide-react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import {
  chunkLocaleStatus,
  editableBody,
  STATUS_LABELS,
  type Chunk,
  type ChunkDraft,
  type ChunkLocaleStatus,
  type ImageAlign,
} from "@/lib/coach/chunk-doc";
import { bodyText, isTextBody, KIND_LABELS, lintBody, type ChunkKind } from "@/lib/coach/chunks";
import { LOCALES, type Locale } from "@/lib/coach/types";
import type { ResolveImage } from "./phone-preview";
import type { ChunkEditor } from "./use-chunk-editor";

export type LibraryTarget = { mode: "insert"; afterIndex: number } | { mode: "replace"; id: string };

type Props = {
  draft: ChunkDraft;
  locale: Locale;
  editor: ChunkEditor;
  resolveImage: ResolveImage;
  disabled?: boolean;
  onOpenLibrary: (target: LibraryTarget) => void;
};

const KINDS: Exclude<ChunkKind, "image">[] = ["paragraph", "heading", "bullet", "numbered", "code", "rule"];
const ALIGNS: { value: ImageAlign; label: string }[] = [
  { value: "full", label: "Full width (what the app draws)" },
  { value: "left", label: "Left, 60% (preview only)" },
  { value: "center", label: "Centred, 60% (preview only)" },
  { value: "right", label: "Right, 60% (preview only)" },
];

const STATUS_DOT: Record<ChunkLocaleStatus, string> = {
  translated: "bg-emerald-400",
  same: "bg-amber-400",
  missing: "bg-red-400",
  stale: "bg-orange-500",
};

/** The side rail: the selected chunk's structure, its languages, images, warnings and the outline. */
export function ChunkInspector({ draft, locale, editor, resolveImage, disabled, onOpenLibrary }: Props) {
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const { chunks } = draft;
  const index = chunks.findIndex((chunk) => chunk.id === editor.state.selectedId);
  const chunk = index >= 0 ? chunks[index] : null;
  const body = chunk ? editableBody(chunk, locale) ?? null : null;

  const warnings = useMemo(
    () =>
      chunks.flatMap((c, i) => {
        const b = editableBody(c, locale);
        return b ? lintBody(b).map((w) => ({ id: c.id, index: i, message: w.message })) : [];
      }),
    [chunks, locale],
  );

  async function copyFromEn(target: Chunk) {
    const status = chunkLocaleStatus(target, locale);
    if (status === "translated" || status === "stale") {
      const ok = await confirm({
        title: `Replace the ${locale} text with en?`,
        description: `This chunk has its own ${locale} text; copying en overwrites it. Undo (Ctrl+Z) brings it back.`,
        confirmLabel: "Replace",
        variant: "danger",
      });
      if (!ok) return;
    }
    editor.copyFrom(target.id, "en");
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      <Card className="space-y-3 py-3 text-sm">
        {!chunk || !body ? (
          <>
            <h3 className="font-medium">Chunk</h3>
            <p className="text-xs text-zinc-500">
              Click a chunk in the phone to edit it in place. Enter splits a paragraph, Backspace at its start joins it to the
              previous one, Alt+↑/↓ moves it, Escape leaves edit mode. Typing <code>- </code>, <code>1. </code> or <code># </code>
              at the start turns a paragraph into that kind, as the app would read it.
            </p>
            {chunk && !body && (
              <p className="text-xs text-red-600">
                This chunk exists only in {LOCALES.filter((l) => chunk.content[l]).join(", ")}. Copy it into {locale} from the
                preview, or delete it.
              </p>
            )}
            {chunk && (
              <Button type="button" variant="ghost" className="h-7 px-2 text-xs text-red-600" disabled={disabled} onClick={() => editor.remove(chunk.id)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete chunk
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">
                {KIND_LABELS[body.kind]}{" "}
                <span className="text-xs font-normal text-zinc-500">
                  {index + 1} of {chunks.length}
                </span>
              </h3>
              <div className="ml-auto flex items-center gap-0.5">
                <IconButton label="Move up (Alt+Up)" disabled={disabled || index === 0} onClick={() => editor.move(chunk.id, -1)}>
                  <MoveUp className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Move down (Alt+Down)" disabled={disabled || index === chunks.length - 1} onClick={() => editor.move(chunk.id, 1)}>
                  <MoveDown className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Duplicate chunk" disabled={disabled} onClick={() => editor.duplicate(chunk.id)}>
                  <Copy className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Delete chunk" disabled={disabled} className="text-red-600" onClick={() => editor.remove(chunk.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </div>

            {body.kind !== "image" && (
              <label className="block text-xs text-zinc-600">
                Kind
                <select
                  aria-label="Chunk kind"
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                  value={body.kind}
                  disabled={disabled}
                  onChange={(e) => editor.changeKind(chunk.id, e.target.value as Exclude<ChunkKind, "image">)}
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {body.kind === "heading" && (
              <fieldset className="text-xs text-zinc-600">
                <legend>Level</legend>
                <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Heading level">
                  {[1, 2, 3].map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={body.level === level}
                      disabled={disabled}
                      className={cn(
                        "rounded-md border px-2 py-1 text-sm",
                        body.level === level ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 hover:bg-zinc-50",
                      )}
                      onClick={() => editor.changeLevel(chunk.id, level)}
                    >
                      H{level}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">The app draws # as a title and ## / ### as a headline.</p>
              </fieldset>
            )}

            {body.kind === "bullet" && (
              <label className="block text-xs text-zinc-600">
                Indent (0–2, Tab / Shift+Tab while editing)
                <select
                  aria-label="Bullet indent"
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                  value={Math.min(2, body.indent)}
                  disabled={disabled}
                  onChange={(e) => editor.changeIndent(chunk.id, Number(e.target.value))}
                >
                  {[0, 1, 2].map((indent) => (
                    <option key={indent} value={indent}>
                      {indent}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {body.kind === "numbered" && (
              <label className="block text-xs text-zinc-600">
                Number (the app shows it as written; indentation is ignored)
                <Input
                  type="number"
                  min={1}
                  max={999}
                  aria-label="Item number"
                  className="mt-1"
                  value={body.number}
                  disabled={disabled}
                  onChange={(e) => editor.changeNumber(chunk.id, Number(e.target.value))}
                />
              </label>
            )}

            {body.kind === "image" && (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="h-20 w-20 shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-50"
                    aria-label="Enlarge image"
                    title="Enlarge"
                    onClick={() => editor.openLightbox(chunk.id)}
                  >
                    {resolveImage(body.url) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- storage and blob URLs, no optimisation
                      <img src={resolveImage(body.url) ?? ""} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[10px] text-zinc-400">not on Storage</span>
                    )}
                  </button>
                  <div className="min-w-0 flex-1 space-y-1 text-xs">
                    <p className="truncate text-zinc-500" title={body.url}>
                      {body.url.startsWith("pending:") ? "Pending: uploaded on Save" : body.url}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" variant="secondary" className="h-7 px-2 text-xs" onClick={() => editor.openLightbox(chunk.id)}>
                        <Maximize2 className="h-3.5 w-3.5" /> Enlarge
                      </Button>
                      <Button type="button" variant="secondary" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => fileRef.current?.click()}>
                        Replace from file
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        disabled={disabled}
                        onClick={() => onOpenLibrary({ mode: "replace", id: chunk.id })}
                      >
                        <ImageIcon className="h-3.5 w-3.5" /> From library
                      </Button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        aria-label="Replacement image file"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) editor.replaceImage(chunk.id, file);
                          event.target.value = "";
                        }}
                      />
                    </div>
                  </div>
                </div>
                <label className="block text-xs text-zinc-600">
                  Alt text ({locale}; shown if the image cannot load)
                  <Input
                    className="mt-1"
                    value={body.alt}
                    disabled={disabled}
                    onChange={(e) => editor.setAlt(chunk.id, e.target.value)}
                  />
                </label>
                <label className="block text-xs text-zinc-600">
                  Alignment · preview only
                  <select
                    aria-label="Image alignment (preview only)"
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                    value={chunk.previewAlign ?? "full"}
                    disabled={disabled}
                    onChange={(e) => editor.changeAlign(chunk.id, e.target.value as ImageAlign)}
                  >
                    {ALIGNS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-zinc-500">
                    The app always draws images full width and its markdown has no alignment syntax. This setting is a
                    what-if for the preview, is never saved, and resets when the lesson reloads.
                  </span>
                </label>
              </div>
            )}

            <div>
              <h4 className="text-xs font-medium text-zinc-600">Languages</h4>
              <ul className="mt-1 space-y-1">
                {LOCALES.map((l) => {
                  const status = chunkLocaleStatus(chunk, l);
                  const own = chunk.content[l];
                  const neutral = status === "same" && !isTextBody(body);
                  return (
                    <li key={l} className="flex items-center gap-2 text-xs">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", neutral ? "bg-zinc-300" : STATUS_DOT[status])} aria-hidden />
                      <span className={cn("w-5 font-medium", l === locale && "underline")}>{l}</span>
                      <span className="min-w-0 flex-1 truncate text-zinc-600" title={own ? bodyText(own) : undefined}>
                        {l === "en"
                          ? status === "missing"
                            ? "Missing in en"
                            : own
                              ? bodyText(own) || KIND_LABELS[own.kind]
                              : ""
                          : neutral
                            ? "Shared with en"
                            : STATUS_LABELS[status]}
                      </span>
                      {l === locale && l !== "en" && chunk.content.en && !disabled && (
                        <>
                          {status !== "same" && (
                            <button type="button" className="rounded px-1 text-zinc-700 underline-offset-2 hover:underline" onClick={() => void copyFromEn(chunk)}>
                              Copy from en
                            </button>
                          )}
                          {own && (
                            <button type="button" className="rounded px-1 text-zinc-700 underline-offset-2 hover:underline" onClick={() => editor.clearLocale(chunk.id)}>
                              Use en
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-medium text-zinc-600">Insert after this chunk</h4>
              <div className="mt-1 flex flex-wrap gap-1">
                {KINDS.map((kind) => (
                  <Button key={kind} type="button" variant="secondary" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => editor.insertAfter(index, kind)}>
                    {KIND_LABELS[kind]}
                  </Button>
                ))}
                <Button type="button" variant="secondary" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onOpenLibrary({ mode: "insert", afterIndex: index })}>
                  <ImageIcon className="h-3.5 w-3.5" /> Image from library
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {warnings.length > 0 && (
        <Card className="py-3 text-xs">
          <p className="mb-1 flex items-center gap-1 font-medium text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5" /> The app will not render this as written
          </p>
          <ul className="space-y-0.5 text-amber-900">
            {warnings.map((warning, i) => (
              <li key={i}>
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => editor.focusChunk(warning.id)}>
                  Chunk {warning.index + 1}
                </button>
                : {warning.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="py-3 text-xs">
        <h3 className="mb-1 font-medium">Outline · {locale}</h3>
        {chunks.length === 0 ? (
          <p className="text-zinc-500">No chunks yet.</p>
        ) : (
          <ol className="space-y-0.5">
            {chunks.map((c, i) => {
              const b = editableBody(c, locale);
              const status = chunkLocaleStatus(c, locale);
              const neutral = !b || (status === "same" && !isTextBody(b));
              const active = c.id === editor.state.selectedId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left hover:bg-zinc-100",
                      active && "bg-zinc-100 ring-1 ring-zinc-300",
                    )}
                    aria-current={active || undefined}
                    onClick={() => editor.focusChunk(c.id)}
                  >
                    <span className="w-4 shrink-0 text-right tabular-nums text-zinc-400">{i + 1}</span>
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-full", !b ? "bg-red-400" : neutral || locale === "en" ? "bg-zinc-300" : STATUS_DOT[status])}
                      title={!b ? "Not in this locale or en" : STATUS_LABELS[status]}
                      aria-hidden
                    />
                    <span className="w-16 shrink-0 text-zinc-500">{b ? KIND_LABELS[b.kind] : "Other locale"}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-800">{b ? bodyText(b) || (b.kind === "rule" ? "―" : "") : ""}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  className,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" variant="ghost" className={cn("h-7 px-1.5", className)} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}
