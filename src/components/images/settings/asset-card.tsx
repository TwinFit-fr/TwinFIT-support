"use client";

import { useRef } from "react";
import { AuthedImage } from "@/components/images/authed-image";
import { useConfirm } from "@/components/ui/confirm";
import { Button } from "@/components/ui/primitives";
import { useGenerationConfirm } from "@/hooks/use-generation-confirm";

/**
 * One style asset (character, logo, support, muscle base, library reference): preview on the
 * left, what it is and its actions on the right. Every asset card on Styles uses this layout,
 * and asks the same way before generating over an image or removing one.
 */
export function AssetCard({
  fileId,
  title,
  name,
  unsavedStyle = false,
  subtitle,
  children,
  emptyLabel = "No image",
  busy,
  onUpload,
  onGenerate,
  onRemove,
  extraActions,
}: {
  fileId: string | null | undefined;
  title: string;
  /** What the asset is, for confirmations: "man character", "front base". */
  name: string;
  /** The style has unsaved edits, which generating ignores. */
  unsavedStyle?: boolean;
  subtitle?: string;
  children?: React.ReactNode;
  emptyLabel?: string;
  busy: boolean;
  onUpload: (file: File) => void;
  onGenerate?: () => void;
  onRemove?: () => void;
  extraActions?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const confirmGeneration = useGenerationConfirm();

  async function generate() {
    const go = await confirmGeneration.asset({
      name,
      replacing: Boolean(fileId),
      unsaved: unsavedStyle,
    });
    if (go) onGenerate?.();
  }

  async function remove() {
    const go = await confirm({
      title: `Remove the ${name}?`,
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (go) onRemove?.();
  }
  return (
    <div className="flex overflow-hidden rounded-lg border border-zinc-200">
      <div className="flex aspect-square w-1/2 items-center justify-center bg-zinc-100">
        {fileId ? (
          <AuthedImage fileId={fileId} alt={title} className="h-full w-full object-contain" />
        ) : (
          <span className="px-2 text-center text-xs text-zinc-400">{emptyLabel}</span>
        )}
      </div>
      <div className="flex w-1/2 flex-col justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-800">{title}</div>
          {subtitle && <div className="truncate text-[11px] text-zinc-500">{subtitle}</div>}
          {children}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onUpload(file);
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            className="h-8 px-2.5 text-xs"
            onClick={() => inputRef.current?.click()}
          >
            {busy && !onGenerate ? "…" : fileId ? "Replace" : "Upload"}
          </Button>
          {onGenerate && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              className="h-8 px-2.5 text-xs"
              onClick={() => void generate()}
            >
              {busy ? "…" : "Generate"}
            </Button>
          )}
          {extraActions}
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy || !fileId}
              className="h-8 px-2.5 text-xs"
              onClick={() => void remove()}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small explanatory text under an asset card title. */
export function AssetNote({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <p className="mt-1 line-clamp-4 text-[11px] leading-snug text-zinc-600" title={title}>
      {children}
    </p>
  );
}
