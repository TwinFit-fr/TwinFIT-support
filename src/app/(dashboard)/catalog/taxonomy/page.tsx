"use client";

import { useState } from "react";
import Link from "next/link";
import { TaxonomyAnatomyPanel } from "@/components/catalog/taxonomy/taxonomy-anatomy-panel";
import { TaxonomyGroupMovementsPanel } from "@/components/catalog/taxonomy/taxonomy-group-movements-panel";
import {
  type LookupExtraFields,
  TaxonomyLookupTable,
} from "@/components/catalog/taxonomy/taxonomy-lookup-table";
import { TaxonomySubnav } from "@/components/catalog/taxonomy/taxonomy-subnav";
import type { LookupRowFull, TaxonomyData, TaxonomyTabId } from "@/components/catalog/taxonomy/types";
import type { ProfileDraft } from "@/components/catalog/taxonomy/pair-profiles-editor";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";

const LOOKUP_TABLES: TaxonomyTabId[] = [
  "catalog_movement_types",
  "catalog_strength_patterns",
  "catalog_equipment",
  "catalog_support_equipment",
  "catalog_variations",
  "catalog_positions",
  "catalog_grips",
  "catalog_load_modalities",
  "catalog_logging_modes",
  "catalog_muscles",
  "catalog_muscle_groups",
  "catalog_body_regions",
];

export default function CatalogTaxonomyPage() {
  const staffFetch = useStaffFetch();
  const [tab, setTab] = useState<TaxonomyTabId>("anatomy");
  const {
    data: response,
    error: loadError,
    isLoading: loading,
    mutate,
  } = useStaffSWR<{ data: TaxonomyData }>("/api/catalog/taxonomy");
  const data = response?.data ?? null;
  const [message, setMessage] = useState<string | null>(null);
  const shownMessage =
    message ?? (loadError ? loadError.message || "Failed to load taxonomy" : null);

  async function load() {
    await mutate();
  }

  async function addEntry(
    table: string,
    code: string,
    name: string,
    extra?: LookupExtraFields & { home_group_code?: string },
  ) {
    setMessage(null);
    try {
      await staffFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({
          table,
          code,
          name,
          ...(extra?.body_region_code ? { body_region_code: extra.body_region_code } : {}),
          // A new muscle linked as target of a group: that group is its home.
          ...(extra?.home_group_code ? { muscle_group_code: extra.home_group_code, role: "target" } : {}),
        }),
      });
      setMessage(extra?.home_group_code ? `Added ${code} (home ${extra.home_group_code})` : `Added ${code}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Add entry failed");
    }
  }

  async function saveRow(
    table: string,
    id: string,
    fields: {
      name?: string;
      sort_order: number;
      /** Left out for closed lists. */
      active?: boolean;
      description?: string | null;
    } & LookupExtraFields,
  ) {
    setMessage(null);
    try {
      await staffFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({
          kind: "update",
          table,
          id,
          ...(fields.name !== undefined ? { name: fields.name } : {}),
          sort_order: fields.sort_order,
          ...(fields.active !== undefined ? { active: fields.active } : {}),
          ...(fields.description !== undefined ? { description: fields.description } : {}),
          ...(fields.body_region_code ? { body_region_code: fields.body_region_code } : {}),
        }),
      });
      setMessage("Saved");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  /** One relation write; throws the API's message (callers report it and reload). */
  async function postRelation(
    muscleGroupCode: string,
    relationKind: "muscle" | "movement",
    code: string,
    action: "link" | "unlink",
    role?: string,
  ) {
    await staffFetch("/api/catalog/taxonomy", {
      method: "POST",
      body: JSON.stringify({
        kind: "relation",
        relationKind,
        action,
        muscle_group_code: muscleGroupCode,
        code,
        ...(action === "link" && relationKind === "muscle" ? { role: role || "target" } : {}),
      }),
    });
  }

  /** A movement link or unlink, reported on the page. */
  async function changeMovement(groupCode: string, movementCode: string, action: "link" | "unlink") {
    setMessage(null);
    try {
      await postRelation(groupCode, "movement", movementCode, action);
      setMessage(`${action === "link" ? "Linked" : "Unlinked"} ${groupCode} + ${movementCode}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Relation update failed");
    }
    await load();
  }

  async function savePairMuscles(
    muscleGroupCode: string,
    movementTypeCode: string,
    muscles: { target: string; secondary: string[] },
  ): Promise<string | null> {
    setMessage(null);
    try {
      await staffFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({
          kind: "pair_muscles",
          muscle_group_code: muscleGroupCode,
          movement_type_code: movementTypeCode,
          target_muscle_code: muscles.target,
          secondary_muscle_codes: muscles.secondary,
        }),
      });
      setMessage(`Saved muscles of ${muscleGroupCode} + ${movementTypeCode}`);
      await load();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Pair muscles update failed";
    }
  }

  async function savePairStrengthPattern(
    muscleGroupCode: string,
    movementTypeCode: string,
    strengthPattern: string,
  ): Promise<string | null> {
    setMessage(null);
    try {
      await staffFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({
          kind: "pair_strength_pattern",
          muscle_group_code: muscleGroupCode,
          movement_type_code: movementTypeCode,
          strength_pattern: strengthPattern,
        }),
      });
      setMessage(`Saved strength pattern of ${muscleGroupCode} + ${movementTypeCode}`);
      await load();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Pair strength pattern update failed";
    }
  }

  /**
   * Links, re-roles or unlinks each selected muscle, one request each; every failure is reported
   * (a refused one does not stop the others, and is not hidden by a later "Saved").
   */
  async function applyRelations(
    muscleGroupCode: string,
    relationKind: "muscle" | "movement",
    items: Array<{ code: string; linked: boolean; currentRole?: string }>,
    linkRole?: string,
  ) {
    setMessage(null);
    const errors: string[] = [];
    for (const item of items) {
      try {
        if (!item.linked) {
          await postRelation(muscleGroupCode, relationKind, item.code, "link", linkRole);
        } else if (
          relationKind === "muscle" &&
          item.currentRole &&
          item.currentRole !== linkRole
        ) {
          await postRelation(muscleGroupCode, relationKind, item.code, "link", linkRole);
        } else {
          await postRelation(muscleGroupCode, relationKind, item.code, "unlink");
        }
      } catch (err) {
        errors.push(`${item.code}: ${err instanceof Error ? err.message : "save failed"}`);
      }
    }
    setMessage(errors.length ? errors.join(" · ") : "Saved");
    await load();
  }

  async function savePairProfile(
    muscleGroupCode: string,
    movementTypeCode: string,
    profile: ProfileDraft,
  ): Promise<string | null> {
    setMessage(null);
    try {
      await staffFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({
          kind: "pair_target_profile",
          muscle_group_code: muscleGroupCode,
          movement_type_code: movementTypeCode,
          target_muscle_code: profile.target,
          secondary_muscle_codes: profile.secondary,
          reason: profile.reason,
        }),
      });
      setMessage(`Saved profile ${profile.target} of ${muscleGroupCode} + ${movementTypeCode}`);
      await load();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Target profile update failed";
    }
  }

  async function deletePairProfile(
    muscleGroupCode: string,
    movementTypeCode: string,
    target: string,
  ): Promise<string | null> {
    setMessage(null);
    try {
      await staffFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({
          kind: "pair_target_profile_delete",
          muscle_group_code: muscleGroupCode,
          movement_type_code: movementTypeCode,
          target_muscle_code: target,
        }),
      });
      setMessage(`Deleted profile ${target} of ${muscleGroupCode} + ${movementTypeCode}`);
      await load();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Target profile delete failed";
    }
  }

  const lookupRows: LookupRowFull[] =
    data && LOOKUP_TABLES.includes(tab)
      ? (data[tab as keyof TaxonomyData] as LookupRowFull[])
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Taxonomy</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Anatomy links muscles to groups (a muscle&apos;s home is the group it is target of).
          Group movements links movement types to groups and edits each pair&apos;s muscles, target
          profiles and strength pattern.
          Regions group muscle groups for the app catalog. Other tabs edit lookup codes, names
          and sort order. Names of translated entries, in every language, are on{" "}
          <Link href="/catalog/localizations" className="underline">
            Catalog → Localizations
          </Link>
          .
        </p>
      </div>

      <TaxonomySubnav active={tab} onChange={setTab} />

      {loading && <p className="text-sm text-zinc-500">Loading taxonomy…</p>}
      {shownMessage && <p className="text-sm text-zinc-700">{shownMessage}</p>}

      {data && tab === "anatomy" && (
        <TaxonomyAnatomyPanel
          groups={data.catalog_muscle_groups}
          muscles={data.catalog_muscles}
          regions={data.catalog_body_regions}
          onAddGroup={(code, regionCode) =>
            addEntry("catalog_muscle_groups", code, "", {
              body_region_code: regionCode,
            })
          }
          onApplyRelations={applyRelations}
          onAddMuscle={async (code, homeGroupCode) => {
            await addEntry("catalog_muscles", code, "", { home_group_code: homeGroupCode });
          }}
        />
      )}

      {data && tab === "group_movements" && (
        <TaxonomyGroupMovementsPanel
          groups={data.catalog_muscle_groups}
          movements={data.catalog_movement_types}
          muscles={data.catalog_muscles}
          strengthPatterns={data.catalog_strength_patterns}
          onLink={(groupCode, movementCode) => changeMovement(groupCode, movementCode, "link")}
          onUnlink={(groupCode, movementCode) => changeMovement(groupCode, movementCode, "unlink")}
          onSaveMuscles={savePairMuscles}
          onSaveStrengthPattern={savePairStrengthPattern}
          onSaveProfile={savePairProfile}
          onDeleteProfile={deletePairProfile}
        />
      )}

      {data && LOOKUP_TABLES.includes(tab) && (
        <TaxonomyLookupTable
          // Drafts and the add form belong to one table.
          key={tab}
          table={tab}
          rows={lookupRows}
          regions={data.catalog_body_regions}
          onAdd={(code, name, extra) => addEntry(tab, code, name, extra)}
          onSave={(id, fields) => saveRow(tab, id, fields)}
        />
      )}
    </div>
  );
}
