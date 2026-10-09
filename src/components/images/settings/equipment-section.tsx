"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui/primitives";
import type { LookupRowFull, TaxonomyData } from "@/components/catalog/taxonomy/types";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import type { ImageStyle } from "@/lib/images/types";
import { AssetCard, AssetGroup, AssetNote } from "./asset-card";

/** Load equipment (catalog.equipment) or support equipment (catalog.support_equipment). */
export type EquipmentKind = "load" | "support";

const KIND = {
  load: {
    title: "Load equipment",
    intro: "Shown on the app's equipment filter cards.",
    taxonomy: "catalog_equipment",
    tab: "Equipment",
    empty: "No active load equipment in the catalog.",
  },
  support: {
    title: "Support equipment",
    intro:
      "Sent as the reference when generating Start frames that use the support, and shown on the app's support filter cards.",
    taxonomy: "catalog_support_equipment",
    tab: "Support",
    empty: "No active support equipment in the catalog.",
  },
} as const;

/** The style's image file per equipment id of the kind. */
function filesOf(style: ImageStyle, kind: EquipmentKind): Map<string, string> {
  return new Map(
    kind === "load"
      ? style.equipment.map((row) => [row.equipment_id, row.file_id])
      : style.supports.map((row) => [row.support_equipment_id, row.file_id]),
  );
}

function EquipmentCard({
  kind,
  item,
  fileId,
  busy,
  dirty,
  onAction,
}: {
  kind: EquipmentKind;
  item: LookupRowFull;
  fileId: string | null;
  busy: boolean;
  dirty: boolean;
  onAction: (action: "generate" | "remove" | File) => void;
}) {
  const description = item.description?.trim() || null;
  return (
    <AssetCard
      fileId={fileId}
      title={item.name}
      subtitle={item.code}
      name={`${item.name} image`}
      unsavedStyle={dirty}
      emptyLabel="No image"
      busy={busy}
      onUpload={onAction}
      onGenerate={() => onAction("generate")}
      onRemove={() => onAction("remove")}
    >
      <AssetNote>
        {description ?? (
          <span className="italic text-zinc-400">
            No description — add one in Taxonomy → {KIND[kind].tab}.
          </span>
        )}
      </AssetNote>
    </AssetCard>
  );
}

/** One image per active load or support equipment of the catalog, for this style. */
export function EquipmentSection({
  kind,
  style,
  dirty,
  busyId,
  onAction,
}: {
  kind: EquipmentKind;
  style: ImageStyle;
  dirty: boolean;
  busyId: string | null;
  onAction: (id: string, action: "generate" | "remove" | File) => void;
}) {
  const { data: taxonomy, isLoading } = useStaffSWR<{ data: TaxonomyData }>(
    "/api/catalog/taxonomy",
  );
  const meta = KIND[kind];

  const catalog = useMemo(
    () => (taxonomy?.data?.[meta.taxonomy] ?? []).filter((row) => row.active !== false),
    [taxonomy, meta.taxonomy],
  );
  const fileById = useMemo(() => filesOf(style, kind), [style, kind]);

  const filled = catalog.filter((item) => fileById.has(item.id)).length;

  return (
    <AssetGroup
      id={`equipment-${kind}`}
      title={meta.title}
      summary={catalog.length ? `${filled} / ${catalog.length}` : undefined}
    >
      <p className="text-[11px] text-zinc-500">{meta.intro}</p>
      {isLoading && catalog.length === 0 ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : catalog.length === 0 ? (
        <p className="text-xs text-zinc-500">{meta.empty}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {catalog.map((item) => (
            <EquipmentCard
              key={item.id}
              kind={kind}
              item={item}
              fileId={fileById.get(item.id) ?? null}
              busy={busyId === item.id}
              dirty={dirty}
              onAction={(action) => onAction(item.id, action)}
            />
          ))}
        </div>
      )}
    </AssetGroup>
  );
}
