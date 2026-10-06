"use client";

import Link from "next/link";
import type { ImageStyle, MuscleMapView } from "@/lib/images/types";
import { MUSCLE_MAP_VIEWS } from "@/lib/images/types";
import { AssetCard, AssetNote } from "./asset-card";

const VIEW_NOTES: Record<MuscleMapView, string> = {
  front: "Blank body seen from the front. Every front muscle map edits this image.",
  back: "Blank body seen from the back. Every back muscle map edits this image.",
};

export function MuscleBasesSection({
  style,
  dirty,
  busyView,
  onAction,
}: {
  style: ImageStyle;
  dirty: boolean;
  busyView: MuscleMapView | null;
  onAction: (view: MuscleMapView, action: "generate" | "remove" | File) => void;
}) {
  const fileFor = (view: MuscleMapView) =>
    style.muscle_bases.find((b) => b.view === view)?.file_id ?? null;

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
        {MUSCLE_MAP_VIEWS.map((view) => (
          <AssetCard
            key={view}
            fileId={fileFor(view)}
            title={view === "front" ? "Front" : "Back"}
            name={`${view} base`}
            unsavedStyle={dirty}
            emptyLabel="No base"
            busy={busyView === view}
            onUpload={(file) => onAction(view, file)}
            onGenerate={() => onAction(view, "generate")}
            onRemove={() => onAction(view, "remove")}
          >
            <AssetNote>{VIEW_NOTES[view]}</AssetNote>
            <p className="mt-1 text-[10px] text-zinc-400">Uses this style’s base body prompt.</p>
          </AssetCard>
        ))}
      </div>
    </div>
  );
}
