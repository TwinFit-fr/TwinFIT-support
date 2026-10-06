"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui/primitives";
import type { LookupRowFull, TaxonomyData } from "@/components/catalog/taxonomy/types";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import type { ImageStyle } from "@/lib/images/types";
import { AssetCard, AssetNote } from "./asset-card";

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
  const description = support.description?.trim() || null;
  return (
    <AssetCard
      fileId={fileId}
      title={support.name}
      subtitle={support.code}
      name={`${support.name} reference`}
      unsavedStyle={dirty}
      emptyLabel="No reference"
      busy={busy}
      onUpload={onAction}
      onGenerate={() => onAction("generate")}
      onRemove={() => onAction("remove")}
    >
      <AssetNote>
        {description ?? (
          <span className="italic text-zinc-400">
            No description — add one in Taxonomy → Support.
          </span>
        )}
      </AssetNote>
    </AssetCard>
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
