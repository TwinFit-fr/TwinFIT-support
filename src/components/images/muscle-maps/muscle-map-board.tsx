"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { mutate } from "swr";
import { Search } from "lucide-react";
import {
  BOARD_GRID,
  BOARD_REFRESH_MS,
  EmptyState,
  StatusTabs,
  statusCounts,
  type StatusFilter,
} from "@/components/images/board-ui";
import { StyleSelector } from "@/components/images/position-selector";
import { Input, Skeleton } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useStyleChoice, useViewSelection } from "@/hooks/use-generation-queue";
import { useBoardSelection } from "@/hooks/use-board-selection";
import { useMuscleMapQueue } from "@/hooks/use-muscle-map-queue";
import { useGenerationConfirm } from "@/hooks/use-generation-confirm";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { DEFAULT_MAX_CONCURRENCY } from "@/lib/images/capabilities";
import type {
  ImageStyle,
  MuscleMapBoardRow,
  MuscleMapBoardTarget,
  MuscleMapImage,
  MuscleMapTargetRef,
  MuscleMapView,
  StylePrompts,
  StyleReference,
} from "@/lib/images/types";
import { MUSCLE_MAP_VIEWS, muscleMapTargetKey } from "@/lib/images/types";
import { MuscleMapCard, VIEW_LABEL } from "./muscle-map-card";
import { MuscleMapInspector, type MuscleMapRun } from "./muscle-map-inspector";
import { MuscleMapQueueBar } from "./muscle-map-queue-bar";

type BoardResponse = { rows: MuscleMapBoardRow[] };

function matches(target: MuscleMapBoardTarget, status: StatusFilter, query: string): boolean {
  if (status !== "all" && target.status !== status) return false;
  if (!query) return true;
  return target.name.toLowerCase().includes(query) || target.code.toLowerCase().includes(query);
}

export function MuscleMapBoard() {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const confirm = useConfirm();
  const confirmGeneration = useGenerationConfirm();
  const { data: stylesData } = useStaffSWR<{ styles: ImageStyle[] }>("/api/images/styles");
  const styles = stylesData?.styles ?? [];
  const [styleId, setStyleId] = useStyleChoice(styles);
  const style = styles.find((s) => s.id === styleId) ?? null;
  const boardKey = styleId ? `/api/images/muscle-maps?style=${styleId}` : null;
  const { data, isLoading, error } = useStaffSWR<BoardResponse>(boardKey, {
    refreshInterval: BOARD_REFRESH_MS,
  });
  const { data: prompts } = useStaffSWR<StylePrompts>(
    styleId ? `/api/images/prompts?styleId=${styleId}` : null,
  );
  const { data: referencesData } = useStaffSWR<{ references: StyleReference[] }>(
    styleId ? `/api/images/styles/${styleId}/references` : null,
  );
  const [views, setViews] = useViewSelection();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const queue = useMuscleMapQueue();

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const targets = useMemo(
    () => rows.flatMap((row) => (row.group ? [row.group, ...row.muscles] : row.muscles)),
    [rows],
  );
  const counts = useMemo(() => statusCounts(targets.map((t) => t.status)), [targets]);
  const query = search.trim().toLowerCase();
  const visibleRows = useMemo(
    () =>
      rows
        .map((row) => {
          const groupMatches = row.group ? matches(row.group, status, query) : false;
          return {
            ...row,
            groupMatches,
            muscles: row.muscles.filter((m) => matches(m, status, query)),
          };
        })
        .filter((row) => row.groupMatches || row.muscles.length > 0),
    [rows, status, query],
  );
  const visibleTargets = useMemo(
    () =>
      visibleRows.flatMap((row) =>
        row.group && row.groupMatches ? [row.group, ...row.muscles] : row.muscles,
      ),
    [visibleRows],
  );
  const visibleKeys = useMemo(() => visibleTargets.map(muscleMapTargetKey), [visibleTargets]);
  const selection = useBoardSelection(visibleKeys);

  const baseViews = MUSCLE_MAP_VIEWS.filter((view) =>
    style?.muscle_bases.some((b) => b.view === view),
  );
  const runViews = views.filter((view) => baseViews.includes(view));
  const missingBases = views.filter((view) => !baseViews.includes(view));
  const selectedTargets = visibleTargets.filter((t) => selection.has(muscleMapTargetKey(t)));
  const openTarget = targets.find((t) => muscleMapTargetKey(t) === openKey) ?? null;
  const busyViews = (target: MuscleMapBoardTarget) =>
    MUSCLE_MAP_VIEWS.filter(
      (view) =>
        busy.has(`${muscleMapTargetKey(target)}:${view}`) ||
        queue.items.some(
          (item) =>
            item.key === `${muscleMapTargetKey(target)}:${view}` &&
            item.status === "processing",
        ),
    );

  async function refresh() {
    if (boardKey) await mutate(boardKey);
  }

  async function generate(target: MuscleMapTargetRef, view: MuscleMapView, run: MuscleMapRun = {}) {
    if (!styleId) throw new Error("Select a style first");
    await staffFetch("/api/images/muscle-maps/generate", {
      method: "POST",
      body: JSON.stringify({ styleId, target: { kind: target.kind, id: target.id }, view, ...run }),
    });
    await refresh();
  }

  async function generateOne(target: MuscleMapBoardTarget, view: MuscleMapView, run: MuscleMapRun) {
    if (!(await confirmGeneration.run(1))) return;
    const key = `${muscleMapTargetKey(target)}:${view}`;
    setBusy((prev) => new Set(prev).add(key));
    try {
      await generate(target, view, run);
      success(`${target.name} · ${view} generated`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function startQueue() {
    if (!selectedTargets.length || !runViews.length) return;
    if (!(await confirmGeneration.run(selectedTargets.length * runViews.length))) return;
    await queue.start({
      targets: selectedTargets.map((t) => ({ target: t, name: t.name })),
      views: runViews,
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
      generate: (target, view) => generate(target, view),
    });
    success(`${selectedTargets.length} target(s) processed`, "Queue finished");
  }

  async function updateImage(image: MuscleMapImage, change: "activate" | "deactivate" | "delete") {
    try {
      if (change === "delete") {
        const remove = await confirm({
          title: "Delete this muscle map?",
          description: "This cannot be undone.",
          confirmLabel: "Delete",
          variant: "danger",
        });
        if (!remove) return;
        await staffFetch(`/api/images/muscle-maps/items/${image.id}`, { method: "DELETE" });
        success(`${VIEW_LABEL[image.view]} map deleted`);
      } else {
        await staffFetch(`/api/images/muscle-maps/items/${image.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: change === "activate" }),
        });
        const done = change === "activate" ? "set as active" : "deactivated";
        success(`${VIEW_LABEL[image.view]} map ${done}`);
      }
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Muscle maps</h1>
          <p className="text-sm text-zinc-500">
            One front and one back map per muscle group and per muscle.
          </p>
        </div>
        <StyleSelector
          styles={styles}
          value={styleId}
          onChange={setStyleId}
          disabled={queue.running}
        />
      </div>

      {style && baseViews.length < MUSCLE_MAP_VIEWS.length && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {style.name} has no{" "}
          {MUSCLE_MAP_VIEWS.filter((v) => !baseViews.includes(v)).join(" or ")} base yet. Maps
          edit the base of their view:{" "}
          <Link href="/images/styles" className="font-medium underline">
            add it on Styles → References
          </Link>
          .
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <StatusTabs value={status} onChange={setStatus} counts={counts} />
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search muscle or group"
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
      ) : visibleRows.length === 0 ? (
        <EmptyState>No muscles or groups match these filters.</EmptyState>
      ) : (
        <div className="space-y-6">
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
                        onToggle={() => selection.toggle(key)}
                        onOpen={() => setOpenKey(key)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {openTarget && (
        <MuscleMapInspector
          key={openKey}
          target={openTarget}
          template={prompts?.muscleMap?.content ?? ""}
          bases={style?.muscle_bases ?? []}
          library={referencesData?.references ?? []}
          busyViews={busyViews(openTarget)}
          onClose={() => setOpenKey(null)}
          onGenerate={(view, run) => void generateOne(openTarget, view, run)}
          onActivate={(image) => void updateImage(image, "activate")}
          onDeactivate={(image) => void updateImage(image, "deactivate")}
          onDelete={(image) => void updateImage(image, "delete")}
        />
      )}

      <MuscleMapQueueBar
        selectedCount={selection.count}
        onClearSelection={selection.clear}
        plannedImages={selectedTargets.length * runViews.length}
        missingBases={missingBases}
        views={views}
        onViewsChange={setViews}
        running={queue.running}
        items={queue.items}
        done={queue.done}
        total={queue.total}
        errors={queue.errors}
        onGenerate={() => void startQueue()}
        onCancel={queue.cancel}
      />
    </div>
  );
}
