"use client";

import { useMemo, useRef } from "react";
import { AuthedImage } from "@/components/images/authed-image";
import { Button, Skeleton } from "@/components/ui/primitives";
import type { LookupRowFull, TaxonomyData } from "@/components/catalog/taxonomy/types";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import type { ImageStyle } from "@/lib/images/types";

function SupportCard({
  support,
  fileId,
  busy,
  dirty,
  onAction,
}: {
  support: LookupRowFull;
  fileId: string | null;
  busy: boolean;
  dirty: boolean;
  onAction: (action: "generate" | "remove" | File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const description = support.description?.trim() || null;
  return (
    <div className="flex overflow-hidden rounded-lg border border-zinc-200">
      <div className="flex w-1/2 aspect-square items-center justify-center bg-zinc-100">
        {fileId ? (
          <AuthedImage
            fileId={fileId}
            alt={`${support.name} reference`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="px-2 text-center text-xs text-zinc-400">No reference</span>
        )}
      </div>
      <div className="flex w-1/2 flex-col justify-between gap-2 p-3">
        <div>
          <div className="truncate text-sm font-medium text-zinc-800">{support.name}</div>
          <div className="truncate text-[11px] text-zinc-500">{support.code}</div>
          <p className="mt-1 line-clamp-4 text-[11px] leading-snug text-zinc-600">
            {description ?? (
              <span className="italic text-zinc-400">
                No description — add one in Taxonomy → Support.
              </span>
            )}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onAction(file);
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
            Upload
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            className="h-8 px-2.5 text-xs"
            onClick={() => {
              const note = dirty
                ? "\n\nUnsaved changes are ignored: the saved style is used."
                : "";
              if (
                !window.confirm(
                  `Generate a new reference for "${support.name}" with OpenAI?${note}`,
                )
              ) {
                return;
              }
              onAction("generate");
            }}
          >
            {busy ? "…" : "Generate"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !fileId}
            className="h-8 px-2.5 text-xs"
            onClick={() => {
              if (!window.confirm(`Remove the "${support.name}" reference?`)) return;
              onAction("remove");
            }}
          >
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SupportsSection({
  style,
  dirty,
  busyId,
  onAction,
}: {
  style: ImageStyle;
  dirty: boolean;
  busyId: string | null;
  onAction: (supportId: string, action: "generate" | "remove" | File) => void;
}) {
  const { data: taxonomy, isLoading } = useStaffSWR<{ data: TaxonomyData }>(
    "/api/catalog/taxonomy",
  );

  const catalog = useMemo(() => {
    const rows = taxonomy?.data?.catalog_support_equipment ?? [];
    return rows.filter((row) => row.active !== false);
  }, [taxonomy]);

  const fileById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of style.supports) {
      map.set(row.support_equipment_id, row.file_id);
    }
    return map;
  }, [style.supports]);

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        Support equipment
      </p>
      {isLoading && catalog.length === 0 ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : catalog.length === 0 ? (
        <p className="text-xs text-zinc-500">No active support equipment in the catalog.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {catalog.map((support) => (
            <SupportCard
              key={support.id}
              support={support}
              fileId={fileById.get(support.id) ?? null}
              busy={busyId === support.id}
              dirty={dirty}
              onAction={(action) => onAction(support.id, action)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
