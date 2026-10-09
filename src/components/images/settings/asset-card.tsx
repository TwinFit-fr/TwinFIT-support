"use client";

import { useRef } from "react";
import { ChevronRight } from "lucide-react";
import { AuthedImage } from "@/components/images/authed-image";
import { useConfirm } from "@/components/ui/confirm";
import { Button } from "@/components/ui/primitives";
import { useGenerationConfirm } from "@/hooks/use-generation-confirm";
import { useAssetGroupCollapsed } from "@/hooks/use-image-preferences";
import { cn } from "@/lib/utils";

/**
 * One style asset (character, logo, equipment, support, muscle base, library reference): a
 * compact preview on the left, what it is and its actions on the right. Every asset card on Styles uses this layout,
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
      <div className="flex aspect-square w-1/4 min-w-24 shrink-0 items-center justify-center self-start bg-zinc-100">
        {fileId ? (
          <AuthedImage fileId={fileId} alt={title} className="h-full w-full object-contain" />
        ) : (
          <span className="px-2 text-center text-xs text-zinc-400">{emptyLabel}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3">
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

/**
 * A foldable group of asset cards on Styles → Assets (characters, equipment, supports, muscle
 * bases). Folded or open is remembered per browser; `summary` (e.g. "2 / 3") stays visible.
 */
export function AssetGroup({
  id,
  title,
  summary,
  aside,
  children,
}: {
  id: string;
  title: string;
  summary?: React.ReactNode;
  /** Shown next to the title, outside the fold toggle (e.g. a link). */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [collapsed, toggle] = useAssetGroupCollapsed(id);
  const bodyId = `asset-group-${id}`;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400 hover:text-zinc-700"
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform", !collapsed && "rotate-90")}
          />
          {title}
          {summary != null && (
            <span className="font-normal normal-case tracking-normal text-zinc-500">
              · {summary}
            </span>
          )}
        </button>
        {aside}
      </div>
      {!collapsed && (
        <div id={bodyId} className="space-y-3">
          {children}
        </div>
      )}
    </section>
  );
}
