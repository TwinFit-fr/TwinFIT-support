"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import {
  BOARD_GRID,
  BOARD_REFRESH_MS,
  EmptyState,
  StatusTabs,
  statusCounts,
} from "@/components/images/board-ui";
import { StyleSelector } from "@/components/images/generation-controls";
import { Input, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import {
  useCropSelection,
  useStyleChoice,
  useViewSelection,
} from "@/hooks/use-image-preferences";
import { useBoardSelection } from "@/hooks/use-board-selection";
import {
  muscleMapBoardKey,
  useMuscleMapActions,
  type MuscleMapPick,
} from "@/hooks/use-muscle-map-actions";
import { useGenerationConfirm } from "@/hooks/use-generation-confirm";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  type MapBoardFilters,
  mapBoardFiltersQuery,
  matchesMapBoardFilters,
  readMapBoardFilters,
} from "@/lib/images/board-filters";
import { jobTarget } from "@/lib/images/job-types";
import type {
  ImageStyle,
  MuscleMapBoard as MuscleMapBoardData,
  MuscleMapSlot,
} from "@/lib/images/types";
import {
  MUSCLE_MAP_CROPS,
  MUSCLE_MAP_VIEWS,
  muscleMapBoardTargets,
  muscleMapSlotKey,
  muscleMapSlotLabel,
  muscleMapSlots,
  muscleMapTargetKey,
  sameMuscleMapSlot,
  sameMuscleMapTarget,
} from "@/lib/images/types";
import { muscleMapPath } from "@/lib/images/urls";
import { MuscleMapCard } from "./muscle-map-card";
import { MuscleMapQueueBar } from "./muscle-map-queue-bar";

export function MuscleMapBoard() {
  const { success, error: toastError } = useToast();
  const confirmGeneration = useGenerationConfirm();
  const { data: stylesData } = useStaffSWR<{ styles: ImageStyle[] }>("/api/images/styles");
  const styles = stylesData?.styles ?? [];
  const [styleId, setStyleId] = useStyleChoice(styles);
  const style = styles.find((s) => s.id === styleId) ?? null;
  const boardKey = muscleMapBoardKey(styleId);
  const { data, isLoading, error } = useStaffSWR<MuscleMapBoardData>(boardKey, {
    refreshInterval: BOARD_REFRESH_MS,
  });
  const [views, setViews] = useViewSelection();
  const [crops, setCrops] = useCropSelection();
  const filters = readMapBoardFilters(useSearchParams());
  const filtersQuery = mapBoardFiltersQuery(filters);
  // Replaced in place: typing a search adds no history entries.
  const setFilters = (patch: Partial<MapBoardFilters>) =>
    window.history.replaceState(
      null,
      "",
      `/images/muscle-maps${mapBoardFiltersQuery({ ...filters, ...patch })}`,
    );
  const actions = useMuscleMapActions(styleId);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const targets = useMemo(() => muscleMapBoardTargets(data), [data]);
  const counts = useMemo(() => statusCounts(targets.map((t) => t.status)), [targets]);
  const { q, status } = filters;
  const visibleRegions = useMemo(
    () => (data?.regions ?? []).filter((r) => matchesMapBoardFilters(r, { q, status })),
    [data, q, status],
  );
  const visibleRows = useMemo(
    () =>
      rows
        .map((row) => {
          const groupMatches = row.group ? matchesMapBoardFilters(row.group, { q, status }) : false;
          return {
            ...row,
            groupMatches,
            muscles: row.muscles.filter((m) => matchesMapBoardFilters(m, { q, status })),
          };
        })
        .filter((row) => row.groupMatches || row.muscles.length > 0),
    [rows, q, status],
  );
  const visibleTargets = useMemo(
    () => [
      ...visibleRegions,
      ...visibleRows.flatMap((row) =>
        row.group && row.groupMatches ? [row.group, ...row.muscles] : row.muscles,
      ),
    ],
    [visibleRegions, visibleRows],
  );
  const visibleKeys = useMemo(() => visibleTargets.map(muscleMapTargetKey), [visibleTargets]);
  const selection = useBoardSelection(visibleKeys);

  const hasBase = (slot: MuscleMapSlot) =>
    Boolean(style?.muscle_bases.some((b) => sameMuscleMapSlot(b, slot)));
  // Only the bases some target on the board has maps for are asked for.
  const boardSlots = new Set(targets.flatMap((t) => t.slots.map(muscleMapSlotKey)));
  const missingBoardBases = muscleMapSlots(MUSCLE_MAP_VIEWS, MUSCLE_MAP_CROPS).filter(
    (slot) => boardSlots.has(muscleMapSlotKey(slot)) && !hasBase(slot),
  );
  const selectedTargets = visibleTargets.filter((t) => selection.has(muscleMapTargetKey(t)));
  // Each target makes the chosen views and crops it has.
  const picks: MuscleMapPick[] = selectedTargets.flatMap((target) =>
    target.slots
      .filter((slot) => views.includes(slot.view) && crops.includes(slot.crop))
      .map((slot) => ({ target, slot })),
  );
  const runPicks = picks.filter((pick) => hasBase(pick.slot));
  const missingBases = [
    ...new Set(picks.filter((pick) => !hasBase(pick.slot)).map((p) => muscleMapSlotLabel(p.slot))),
  ];
  const plannedImages = runPicks.length;

  async function startQueue() {
    if (!plannedImages) return;
    if (!(await confirmGeneration.run(plannedImages))) return;
    try {
      const queued = await actions.enqueue(runPicks);
      success(`${queued} map(s) queued`, "Generating on the server");
      selection.clear();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed", "Could not queue");
    }
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Muscle maps</h1>
          <p className="text-sm text-zinc-500">
            Each region, group and muscle has the views and crops set on{" "}
            <Link href="/catalog/taxonomy" className="underline">
              Catalog → Taxonomy
            </Link>
            ; the dark label is the one its app card shows.
          </p>
        </div>
        <StyleSelector
          styles={styles}
          value={styleId}
          onChange={setStyleId}
        />
      </div>

      {style && data && missingBoardBases.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {style.name} has no {missingBoardBases.map(muscleMapSlotLabel).join(", ")} base yet.
          Maps edit the base of their view and crop:{" "}
          <Link href="/images/styles?tab=assets" className="font-medium underline">
            add it on Styles → Assets
          </Link>
          .
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <StatusTabs
          value={status}
          onChange={(next) => setFilters({ status: next })}
          counts={counts}
        />
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            value={q}
            onChange={(e) => setFilters({ q: e.target.value })}
            placeholder="Search muscle, group or region"
            className="h-8 w-56 py-1 pl-8 text-xs"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </div>
      )}

      {styleId && !isLoading && visibleTargets.length > 0 && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="tabular-nums">
            {visibleTargets.length} map target{visibleTargets.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={selection.allSelected ? selection.clear : selection.selectAll}
            className="font-medium text-zinc-600 hover:text-zinc-900"
          >
            {selection.allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
      )}

      {!styleId ? (
        <EmptyState>Select a style to load the board.</EmptyState>
      ) : isLoading ? (
        <div className={BOARD_GRID}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/1.3] rounded-xl" />
          ))}
        </div>
      ) : visibleTargets.length === 0 ? (
        <EmptyState>No muscles, groups or regions match these filters.</EmptyState>
      ) : (
        <div className="space-y-6">
          {visibleRegions.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Regions · app catalog cards
              </h2>
              <div className={BOARD_GRID}>
                {visibleRegions.map((target) => {
                  const key = muscleMapTargetKey(target);
                  return (
                    <MuscleMapCard
                      key={key}
                      target={target}
                      selected={selection.has(key)}
                      selecting={selection.count > 0}
                      onToggle={(range) => selection.toggle(key, range)}
                      href={`${muscleMapPath(target)}${filtersQuery}`}
                    />
                  );
                })}
              </div>
            </section>
          )}
          {visibleRows.map((row) => {
            const cards = row.group && row.groupMatches ? [row.group, ...row.muscles] : row.muscles;
            return (
              <section key={row.group?.id ?? "homeless"} className="space-y-2">
                <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  {row.group ? row.group.name : "Muscles without a group"}
                </h2>
                <div className={BOARD_GRID}>
                  {cards.map((target) => {
                    const key = muscleMapTargetKey(target);
                    return (
                      <MuscleMapCard
                        key={key}
                        target={target}
                        selected={selection.has(key)}
                        selecting={selection.count > 0}
                        onToggle={(range) => selection.toggle(key, range)}
                        href={`${muscleMapPath(target)}${filtersQuery}`}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <MuscleMapQueueBar
        selectedCount={selection.count}
        onClearSelection={selection.clear}
        plannedImages={plannedImages}
        missingBases={missingBases}
        views={views}
        onViewsChange={setViews}
        crops={crops}
        onCropsChange={setCrops}
        jobs={actions.jobs.jobs}
        progress={actions.jobs.progress}
        nameOf={(job) => targets.find((t) => sameMuscleMapTarget(t, jobTarget(job)))?.name ?? ""}
        onGenerate={() => void startQueue()}
        onCancel={() => void actions.jobs.cancelActive()}
        onRetry={() => void actions.jobs.retryFailed()}
        onDismiss={() => void actions.jobs.dismissFinished()}
      />
    </div>
  );
}
