"use client";

import Link from "next/link";
import type { ImageStyle, MuscleMapSlot, MuscleMapSlotKey } from "@/lib/images/types";
import {
  MUSCLE_MAP_CROPS,
  MUSCLE_MAP_VIEWS,
  muscleMapSlotKey,
  muscleMapSlotLabel,
  muscleMapSlots,
  sameMuscleMapSlot,
} from "@/lib/images/types";
import { AssetCard, AssetNote } from "./asset-card";

const VIEW_NOTE = { front: "seen from the front", back: "seen from the back" } as const;
const CROP_NOTE = {
  full: "Blank full body",
  upper: "Blank upper body (head to hips)",
  lower: "Blank lower body (hips to feet)",
} as const;

export function MuscleBasesSection({
  style,
  dirty,
  usedSlots,
  busySlot,
  onAction,
}: {
  style: ImageStyle;
  dirty: boolean;
  /** View × crop pairs the catalog has maps for; the others are shown only when they exist. */
  usedSlots: MuscleMapSlot[];
  busySlot: MuscleMapSlotKey | null;
  onAction: (slot: MuscleMapSlot, action: "generate" | "remove" | File) => void;
}) {
  const fileFor = (slot: MuscleMapSlot) =>
    style.muscle_bases.find((b) => sameMuscleMapSlot(b, slot))?.file_id ?? null;
  const slots = muscleMapSlots(MUSCLE_MAP_VIEWS, MUSCLE_MAP_CROPS).filter(
    (slot) => usedSlots.some((used) => sameMuscleMapSlot(used, slot)) || fileFor(slot),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Muscle map bases
        </p>
        <Link href="/images/muscle-maps" className="text-xs text-zinc-500 underline">
          Open muscle maps
        </Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {slots.map((slot) => {
          const label = muscleMapSlotLabel(slot);
          const used = usedSlots.some((u) => sameMuscleMapSlot(u, slot));
          return (
            <AssetCard
              key={muscleMapSlotKey(slot)}
              fileId={fileFor(slot)}
              title={label}
              name={`${label} base`}
              unsavedStyle={dirty}
              emptyLabel="No base"
              busy={busySlot === muscleMapSlotKey(slot)}
              onUpload={(file) => onAction(slot, file)}
              onGenerate={() => onAction(slot, "generate")}
              onRemove={() => onAction(slot, "remove")}
            >
              <AssetNote>
                {CROP_NOTE[slot.crop]} {VIEW_NOTE[slot.view]}. Every {label.toLowerCase()} muscle
                map edits this image.
                {!used && " No catalog entry uses this view and crop now."}
              </AssetNote>
              <p className="mt-1 text-[10px] text-zinc-400">Uses this style’s base body prompt.</p>
            </AssetCard>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-500">
        Which views and crops exist is set per region, group and muscle on{" "}
        <Link href="/catalog/taxonomy" className="underline">
          Catalog → Taxonomy
        </Link>
        .
      </p>
    </div>
  );
}
