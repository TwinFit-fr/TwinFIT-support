"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, X } from "lucide-react";
import { useShortcuts } from "@/hooks/use-shortcuts";
import {
  DEFAULT_FILTER,
  FILTER_STORAGE_KEY,
  countStates,
  exerciseState,
  filterExercises,
  isFiltered,
  nextRowIndex,
  parseFilter,
  queryWords,
  serializeFilter,
  type CatalogFilter,
  type StatusFilter,
} from "@/lib/studio/catalog-filter";
import { isSettled, type LoadState } from "@/lib/studio/load-state";
import { useStudioStore } from "@/lib/studio/store";
import type { StudioExercise } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { useSelectionGuard } from "./hooks/use-selection-guard";
import { CatalogRow } from "./catalog-row";
import { ChipRow, type ChipRowItem } from "./chip-row";
import { CatalogSkeletonRows, ErrorState, SkeletonBar } from "./load-states";
import { Chip } from "./ui";

const ROW_HEIGHT = 62;

function readRemembered(): CatalogFilter {
  try {
    return parseFilter(window.localStorage.getItem(FILTER_STORAGE_KEY));
  } catch {
    return DEFAULT_FILTER;
  }
}

/**
 * The catalog as a to-do list: the state of every exercise, a status filter that combines with
 * the muscle groups, a search, and a virtualized list. Arrow keys move focus; Enter or Space opens
 * the focused exercise (after a confirm when the pose or rig editor holds unsaved work).
 * Memoized: the workspace re-renders on every poll, the list only when the catalog or the
 * selection changes. Until the catalog has answered it shows skeletons (loading) or the failure
 * with Retry, never "0 exercises".
 */
export const CatalogSidebar = memo(function CatalogSidebar({
  exercises,
  state,
  error,
  onRetry,
}: {
  exercises: StudioExercise[];
  state: LoadState;
  error?: unknown;
  onRetry: () => unknown;
}) {
  const settled = isSettled(state);
  const selectedId = useStudioStore((s) => s.exerciseId);
  const selectInStore = useStudioStore((s) => s.selectExercise);
  const guard = useSelectionGuard();
  const selectExercise = useCallback(
    (id: string) => {
      if (id === useStudioStore.getState().exerciseId) return;
      void guard("exercise").then((ok) => {
        if (ok) selectInStore(id);
      });
    },
    [guard, selectInStore],
  );
  const [query, setQuery] = useState("");
  const [stored, setStored] = useState<CatalogFilter>(DEFAULT_FILTER);
  const [restored, setRestored] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const searchRef = useRef<HTMLInputElement>(null);

  // The filter is remembered across reloads (read after mount, so the server render matches).
  useEffect(() => {
    setStored(readRemembered());
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, serializeFilter(stored));
    } catch {
      /* private mode: the filter just is not remembered */
    }
  }, [stored, restored]);

  const groups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of exercises) if (e.group) seen.set(e.group.code, e.group.name);
    return [...seen.entries()].map(([code, name]) => ({ code, name }));
  }, [exercises]);

  // A remembered group that the catalog no longer has is ignored, not applied.
  const group = stored.group && groups.some((g) => g.code === stored.group) ? stored.group : null;
  const filter = useMemo<CatalogFilter>(() => ({ status: stored.status, group }), [stored.status, group]);
  const words = useMemo(() => queryWords(deferredQuery), [deferredQuery]);

  const groupChips = useMemo<ChipRowItem[]>(
    () => [
      { key: "all", label: "All", selected: group === null, onSelect: () => setStored((f) => ({ ...f, group: null })) },
      ...groups.map((g) => ({
        key: g.code,
        label: g.name,
        selected: group === g.code,
        onSelect: () => setStored((f) => ({ ...f, group: g.code })),
      })),
    ],
    [groups, group],
  );

  const totals = useMemo(() => countStates(exercises), [exercises]);
  // The status chips count what the group and the search leave, so a chip never promises rows it cannot show.
  const scoped = useMemo(() => filterExercises(exercises, { status: "all", group }, words), [exercises, group, words]);
  const scopedCounts = useMemo(() => countStates(scoped), [scoped]);
  const filtered = useMemo(() => filterExercises(scoped, { status: filter.status, group: null }, []), [scoped, filter.status]);
  const states = useMemo(() => filtered.map((e) => exerciseState(e.vectors)), [filtered]);
  const narrowed = isFiltered(filter, query);

  const clearFilters = useCallback(() => {
    setQuery("");
    setStored(DEFAULT_FILTER);
  }, []);

  const statusChips: { value: StatusFilter; label: string; full?: string; count: number }[] = [
    { value: "all", label: "All", count: scopedCounts.total },
    { value: "todo", label: "To do", count: scopedCounts.todo },
    { value: "ready", label: "Ready", count: scopedCounts.ready },
    { value: "attention", label: "Attention", full: "Needs attention", count: scopedCounts.failed },
  ];

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => filtered[index].id,
  });

  // Keep the selected row in view when the selection comes from elsewhere (URL, another pane).
  useEffect(() => {
    if (!selectedId) return;
    const index = filtered.findIndex((e) => e.id === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // The list's one tab stop: the row last focused, else the selected row, else the first.
  // Focus follows the selection: a new selection resets the stop to it.
  const [stop, setStop] = useState<{ id: string; forSelected: string | null } | null>(null);
  const stopId = stop && stop.forSelected === selectedId && filtered.some((e) => e.id === stop.id) ? stop.id : null;
  const tabbableId = stopId ?? (selectedId && filtered.some((e) => e.id === selectedId) ? selectedId : filtered[0]?.id ?? null);
  const onFocusRow = useCallback((id: string) => setStop({ id, forSelected: useStudioStore.getState().exerciseId }), []);

  const focusRow = useCallback(
    (index: number) => {
      const target = filtered[index];
      if (!target) return;
      setStop({ id: target.id, forSelected: useStudioStore.getState().exerciseId });
      virtualizer.scrollToIndex(index, { align: "auto" });
      // The row may not be rendered yet (virtualized): wait for it for a few frames.
      let tries = 0;
      const attempt = () => {
        const el = parentRef.current?.querySelector<HTMLElement>(`[data-exo-id="${CSS.escape(target.id)}"]`);
        if (el) el.focus({ preventScroll: true });
        else if (tries++ < 8) requestAnimationFrame(attempt);
      };
      requestAnimationFrame(attempt);
    },
    [filtered, virtualizer],
  );

  const onListKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const current = (event.target as HTMLElement).closest<HTMLElement>("[data-exo-id]")?.dataset.exoId;
      const index = filtered.findIndex((e) => e.id === current);
      if (event.key === "ArrowUp" && index === 0) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const next = nextRowIndex(event.key, index, filtered.length);
      if (next === null) return;
      event.preventDefault();
      focusRow(next);
    },
    [filtered, focusRow],
  );

  // "/" jumps to the search from anywhere that is not a text field.
  useShortcuts({
    "/": () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    },
  });

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const index = filtered.findIndex((e) => e.id === tabbableId);
      focusRow(Math.max(0, index));
    } else if (event.key === "Enter" && filtered[0]) {
      event.preventDefault();
      selectExercise(filtered[0].id);
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
    }
  };

  const animated = totals.ready;
  const pending = [totals.queued ? `${totals.queued} in queue` : null, totals.failed ? `${totals.failed} failed` : null].filter(Boolean);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2.5 px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--m3-on-surface-variant)" aria-hidden />
          <input
            ref={searchRef}
            id="studio-catalog-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search exercises…"
            aria-label="Search exercises by name, muscle group, equipment or number"
            aria-keyshortcuts="/"
            type="search"
            className="h-10 w-full rounded-full border border-transparent bg-(--m3-surface-container-high) pl-10 pr-14 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden text-sm text-(--m3-on-surface) outline-none transition-colors placeholder:text-(--m3-on-surface-variant) focus:border-(--m3-primary)"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-(--m3-on-surface-variant) outline-none hover:text-(--m3-on-surface) focus-visible:ring-2 focus-visible:ring-(--m3-primary)"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : (
            <kbd aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-(--m3-outline) px-1.5 font-mono text-[11px] leading-4 text-(--m3-on-surface-variant)">
              /
            </kbd>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2 text-[12px] text-(--m3-on-surface)">
            <span className="tabular-nums">
              {state === "loading" ? (
                "Loading the catalog…"
              ) : state === "failed" ? (
                <span className="text-(--m3-on-surface-variant)">Catalog not loaded</span>
              ) : (
                <>
                  <strong className="font-semibold">{animated}</strong> of {totals.total} animated
                </>
              )}
            </span>
            {pending.length ? <span className="truncate text-[11px] text-(--m3-on-surface-variant)">{pending.join(" · ")}</span> : null}
          </div>
          {settled ? (
            <div
              role="progressbar"
              aria-label="Exercises animated"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, totals.total)}
              aria-valuenow={animated}
              className="mt-1.5 h-1 overflow-hidden rounded-full bg-(--m3-surface-container-highest)"
            >
              <div className="h-full rounded-full bg-(--m3-success)" style={{ width: `${totals.total ? (animated / totals.total) * 100 : 0}%` }} />
            </div>
          ) : state === "loading" ? (
            <div aria-hidden className="mt-1.5 h-1 rounded-full bg-(--m3-surface-container-highest)" />
          ) : null}
        </div>

        {settled ? (
          <>
            {/* Two by two in a narrow catalog, one row when it fits: a chip is never cut mid-word. */}
            <div role="group" aria-label="Animation status" className="grid grid-cols-2 gap-1 @[18rem]/pane:flex">
              {statusChips.map((chip) => (
                <Chip
                  key={chip.value}
                  className="justify-between gap-1 px-2 @[18rem]/pane:justify-center @[18rem]/pane:px-1.5"
                  aria-label={chip.full ? `${chip.full} ${chip.count}` : undefined}
                  title={chip.full}
                  selected={filter.status === chip.value}
                  aria-pressed={filter.status === chip.value}
                  onClick={() => setStored((f) => ({ ...f, status: chip.value }))}
                >
                  {chip.label}
                  <span className="tabular-nums opacity-100">{chip.count}</span>
                </Chip>
              ))}
            </div>
            <ChipRow label="Muscle group" items={groupChips} />
            <div className="flex h-6 items-center justify-between text-[11px] text-(--m3-on-surface-variant)">
              <span className="tabular-nums" role="status" aria-live="polite">
                {narrowed ? `${filtered.length} of ${totals.total} shown` : `${totals.total} exercises`}
              </span>
              {narrowed ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="cursor-pointer rounded-md px-1.5 py-0.5 font-medium text-(--m3-primary) outline-none hover:underline focus-visible:ring-2 focus-visible:ring-(--m3-primary)"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </>
        ) : state === "loading" ? (
          // The filters wait for the catalog: no chip claims a count before the answer.
          <div aria-hidden className="space-y-2.5 pb-1">
            <div className="flex gap-1">
              <SkeletonBar className="h-7 w-14 rounded-lg" />
              <SkeletonBar className="h-7 w-16 rounded-lg" />
              <SkeletonBar className="h-7 w-14 rounded-lg" />
            </div>
            <div className="flex gap-1">
              <SkeletonBar className="h-7 w-10 rounded-lg" />
              <SkeletonBar className="h-7 w-20 rounded-lg" />
              <SkeletonBar className="h-7 w-16 rounded-lg" />
            </div>
          </div>
        ) : null}
      </div>

      <div
        ref={parentRef}
        role="group"
        aria-label="Exercises"
        onKeyDown={onListKeyDown}
        // Skeleton rows never scroll (nothing to reach with the keyboard yet).
        className={cn("studio-scroll relative mt-1 min-h-0 flex-1", state === "loading" ? "overflow-hidden" : "overflow-y-auto")}
      >
        {state === "loading" ? (
          <>
            <span className="sr-only" role="status">
              Loading the catalog
            </span>
            <CatalogSkeletonRows rows={14} rowHeight={ROW_HEIGHT} />
          </>
        ) : state === "failed" ? (
          <ErrorState className="pt-10" title="The catalog did not load." error={error} onRetry={onRetry} />
        ) : (
          <div style={{ height: virtualizer.getTotalSize() }} className="relative w-full">
            {virtualizer.getVirtualItems().map((item) => {
              const exercise = filtered[item.index];
              return (
                <CatalogRow
                  key={item.key}
                  exercise={exercise}
                  state={states[item.index]}
                  selected={exercise.id === selectedId}
                  tabbable={exercise.id === tabbableId}
                  onSelect={selectExercise}
                  onFocusRow={onFocusRow}
                  top={item.start + 2}
                  height={item.size - 4}
                />
              );
            })}
          </div>
        )}
        {settled && !filtered.length ? (
          <div className="flex flex-col items-center gap-3 px-6 pt-10 text-center">
            <p className="text-xs text-(--m3-on-surface-variant)">
              {narrowed ? "No exercise matches these filters." : "The catalog is empty."}
            </p>
            {narrowed ? (
              <Chip tone="primary" onClick={clearFilters}>
                Clear filters
              </Chip>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});
