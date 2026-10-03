"use client";

import { useMemo, useRef } from "react";
import { AuthedImage } from "@/components/images/authed-image";
import { Button, Skeleton } from "@/components/ui/primitives";
import type { LookupRowFull, TaxonomyData } from "@/components/catalog/taxonomy/types";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import type { ImageStyle } from "@/lib/images/types";
import { Section } from "./form-ui";

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
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
      <div>
        <div className="text-sm font-medium text-zinc-800">{support.name}</div>
        <div className="text-[11px] text-zinc-500">{support.code}</div>
      </div>
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-zinc-100">
        {fileId ? (
          <AuthedImage
            fileId={fileId}
            alt={`${support.name} reference`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="px-4 text-center text-xs text-zinc-400">
            No reference — generate or upload one for this support.
          </span>
        )}
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
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Upload
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
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
          {busy ? "Working…" : "Generate"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || !fileId}
          onClick={() => {
            if (!window.confirm(`Remove the "${support.name}" reference?`)) return;
            onAction("remove");
          }}
        >
          Remove
        </Button>
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
    <Section
      title="Support equipment references"
      description="One reference per active support in the catalog. Upload, Generate and Remove apply immediately for this style."
    >
      {isLoading && catalog.length === 0 ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : catalog.length === 0 ? (
        <p className="text-xs text-zinc-500">No active support equipment in the catalog.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
    </Section>
  );
}
