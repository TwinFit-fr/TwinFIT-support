"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { TableSkeleton } from "@/components/ui/primitives";
import { TabList, TabPanel } from "@/components/ui/tabs";
import { BasesPanel } from "./bases-panel";
import { MasksPanel } from "./masks-panel";
import { PreviewPanel } from "./preview-panel";
import { SettingsPanel } from "./settings-panel";
import { useMuscleMap } from "./use-muscle-map";

type TabId = "bases" | "masks" | "preview" | "settings";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "bases", label: "Bases" },
  { id: "masks", label: "Masks" },
  { id: "preview", label: "Preview vs A" },
  { id: "settings", label: "Settings" },
];

/**
 * Muscle map prototype B: blank bodies per view and one mask per muscle (schema `muscle_map`,
 * staff only). The app doesn't see any of it until an approach is chosen.
 */
export function MuscleMapPage() {
  const api = useMuscleMap();
  const params = useSearchParams();
  // Opening a shared pilot link (`?exo=`) lands on the preview.
  const [tab, setTab] = useState<TabId>(() => (params.has("exo") ? "preview" : "bases"));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Muscle map</h1>
        <p className="text-sm text-zinc-500">
          Prototype B: base bodies + one mask per muscle, painted with the exercise&apos;s
          muscles. Not visible in the app.
        </p>
      </div>
      <TabList label="Muscle map" tabs={TABS} value={tab} onChange={setTab} />
      {api.error && <p className="text-sm text-red-600">{api.error.message}</p>}
      {!api.data ? (
        !api.error && <TableSkeleton />
      ) : (
        <>
          <TabPanel id="bases" selected={tab === "bases"}>
            <BasesPanel api={api} />
          </TabPanel>
          <TabPanel id="masks" selected={tab === "masks"}>
            <MasksPanel api={api} />
          </TabPanel>
          <TabPanel id="preview" selected={tab === "preview"}>
            {tab === "preview" && <PreviewPanel api={api} />}
          </TabPanel>
          <TabPanel id="settings" selected={tab === "settings"}>
            <SettingsPanel api={api} />
          </TabPanel>
        </>
      )}
    </div>
  );
}
