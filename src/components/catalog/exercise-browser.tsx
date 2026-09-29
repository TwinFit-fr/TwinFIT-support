"use client";

import { useMemo, useState } from "react";
import {
  badgeAxesForExercise,
  filterExercisesForBrowser,
  filtersToCreateSelection,
  groupExercises,
  SUPPORT_FILTER_KEY,
  SUPPORT_FILTER_NONE,
  type AxisFilters,
} from "@/lib/catalog/catalog-browser";
import {
  CATALOG_LEVELS,
  getLevelByKey,
  type ExerciseWithPath,
  type LookupRow,
} from "@/lib/catalog/exercise-path";
import {
  CATALOG_LOCALES,
  resolveExerciseDisplayName,
  resolveLocalizedName,
  type CatalogLocale,
  type LocalizedLookup,
} from "@/lib/catalog/locales";
import { Badge, Button, Card } from "@/components/ui/primitives";

type LookupMap = Record<string, LookupRow[] | LocalizedLookup[]>;

type ExerciseBrowserProps = {
  exercises: Array<
    ExerciseWithPath & {
      support_equipment?: { code: string } | null;
      localizations?: Array<{ locale: string; display_name?: string | null }>;
    }
  >;
  lookups: LookupMap;
  search: string;
  locale: CatalogLocale;
  onLocaleChange: (locale: CatalogLocale) => void;
  onEditExercise: (exoId: number) => void;
  onCopyExercise: (exoId: number) => void;
  onCreateExercise: (fromSelection?: Record<string, string>) => void;
};

export function ExerciseBrowser({
  exercises,
  lookups,
  search,
  locale,
  onLocaleChange,
  onEditExercise,
  onCopyExercise,
  onCreateExercise,
}: ExerciseBrowserProps) {
  const [groupByKey, setGroupByKey] = useState("muscle_group");
  const [filters, setFilters] = useState<AxisFilters>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => filterExercisesForBrowser(exercises, search, filters, locale),
    [exercises, search, filters, locale],
  );

  const groups = useMemo(
    () => groupExercises(filtered, groupByKey),
    [filtered, groupByKey],
  );

  function setFilter(levelKey: string, value: string) {
    setFilters((prev) => {
      const next = { ...prev };
      if (!value) delete next[levelKey];
      else next[levelKey] = value;
      return next;
    });
  }

  function toggleGroup(code: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function labelForCode(table: string, code: string): string {
    const rows = lookups[table] ?? [];
    const row = rows.find((r) => r.code === code);
    return resolveLocalizedName(row as LocalizedLookup, locale);
  }

  const groupLevel = getLevelByKey(groupByKey);

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-zinc-700">Group by</span>
            <select
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              value={groupByKey}
              onChange={(e) => {
                setGroupByKey(e.target.value);
                setExpanded(new Set());
              }}
            >
              {CATALOG_LEVELS.map((level) => (
                <option key={level.key} value={level.key}>
                  {level.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-zinc-700">Labels</span>
            <select
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              value={locale}
              onChange={(e) => onLocaleChange(e.target.value as CatalogLocale)}
            >
              {CATALOG_LOCALES.map((loc) => (
                <option key={loc} value={loc}>
                  {loc.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <span className="text-sm text-zinc-500">
            {filtered.length} / {exercises.length} exercises
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          {CATALOG_LEVELS.filter((l) => l.key !== groupByKey).map((level) => {
            const tableRows = lookups[level.table] ?? [];
            return (
              <label key={level.key} className="flex min-w-[140px] flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-600">{level.label}</span>
                <select
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  value={filters[level.key] ?? ""}
                  onChange={(e) => setFilter(level.key, e.target.value)}
                >
                  <option value="">All</option>
                  {tableRows.map((row) => (
                    <option key={row.code} value={row.code}>
                      {row.code} — {resolveLocalizedName(row as LocalizedLookup, locale)}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          <label className="flex min-w-[140px] flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-600">Support</span>
            <select
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              value={filters[SUPPORT_FILTER_KEY] ?? ""}
              onChange={(e) => setFilter(SUPPORT_FILTER_KEY, e.target.value)}
            >
              <option value="">All</option>
              <option value={SUPPORT_FILTER_NONE}>None</option>
              {(lookups.catalog_support_equipment ?? []).map((row) => (
                <option key={row.code} value={row.code}>
                  {row.code} — {resolveLocalizedName(row as LocalizedLookup, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {groups.length === 0 ? (
        <Card className="p-6 text-center text-sm text-zinc-500">
          No exercises match the current filters.
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const isOpen = expanded.has(group.code);
            const table = groupLevel?.table ?? "";
            const groupLabel = labelForCode(table, group.code);
            return (
              <Card key={group.code} className="overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50"
                  onClick={() => toggleGroup(group.code)}
                >
                  <div>
                    <span className="font-mono text-sm text-zinc-500">{group.code}</span>
                    <span className="ml-2 font-medium">{groupLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{group.exercises.length}</Badge>
                    <span className="text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-zinc-100">
                    <div className="flex justify-end border-b border-zinc-100 px-4 py-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          onCreateExercise(
                            filtersToCreateSelection(filters, groupByKey, group.code),
                          )
                        }
                      >
                        + Add in this group
                      </Button>
                    </div>
                    <ul className="divide-y divide-zinc-100">
                      {group.exercises.map((ex) => {
                        const badges = badgeAxesForExercise(ex, groupByKey);
                        const displayName = resolveExerciseDisplayName(ex, locale);
                        return (
                          <li
                            key={ex.exo_id}
                            className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="font-mono text-xs text-zinc-400">
                                  #{ex.exo_id}
                                </span>
                                <span className="font-medium">{displayName}</span>
                                {ex.taxonomy_status === "pending" && (
                                  <Badge className="bg-amber-100 text-amber-900">
                                    pending
                                  </Badge>
                                )}
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {badges.map((b) => (
                                  <Badge key={`${b.key}-${b.code}`} className="text-xs">
                                    {b.code}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => onEditExercise(ex.exo_id)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => onCopyExercise(ex.exo_id)}
                              >
                                Copy
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
