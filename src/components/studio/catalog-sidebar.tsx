"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Dumbbell, Search, X } from "lucide-react";
import { useStudioStore } from "@/lib/studio/store";
import type { StudioExercise } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { useSelectionGuard } from "./hooks/use-selection-guard";
import { Chip, StatusDot } from "./ui";

const ROW_HEIGHT = 64;

function matches(exercise: StudioExercise, needle: string): boolean {
  if (!needle) return true;
  const hay = `${exercise.exo_id} ${exercise.display_name} ${exercise.group?.name ?? ""} ${
    exercise.equipment?.name ?? ""
  } ${exercise.target_muscle?.name ?? ""}`.toLowerCase();
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

const Row = memo(function Row({
  exercise,
  selected,
  onSelect,
  top,
  height,
}: {
  exercise: StudioExercise;
  selected: boolean;
  onSelect: (id: string) => void;
  top: number;
  height: number;
}) {
  const { vectors } = exercise;
  return (
    <button
      type="button"
      // Primitive props keep the memo effective (a style object would be new on every render).
      style={{ top, height }}
      onClick={() => onSelect(exercise.id)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "studio-state absolute left-2 right-2 flex cursor-pointer items-center gap-3 rounded-xl px-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-(--m3-primary)/60",
        selected
          ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)"
          : "text-(--m3-on-surface)",
      )}
    >
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-(--m3-surface-container-highest)">
        {exercise.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${exercise.thumbnail_url}?w=96&q=70`}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-(--m3-on-surface-variant)/50">
            <Dumbbell className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium leading-tight">{exercise.display_name}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-(--m3-on-surface-variant)">
          <span className="font-mono tabular-nums opacity-70">#{exercise.exo_id}</span>
          {exercise.group ? <span className="truncate">{exercise.group.name}</span> : null}
          {exercise.equipment && exercise.equipment.code !== "NONE" ? (
            <span className="truncate opacity-80">· {exercise.equipment.name}</span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5" title={vectorTitle(vectors)}>
        {vectors.queued > 0 ? <StatusDot status="processing" /> : null}
        {vectors.ready > 0 ? <StatusDot status="ready" /> : null}
        {vectors.failed > 0 && vectors.ready === 0 && vectors.queued === 0 ? (
          <StatusDot status="error" />
        ) : null}
      </div>
    </button>
  );
});

function vectorTitle(v: StudioExercise["vectors"]): string {
  if (!v.total) return "No movement yet";
  return [
    v.ready ? `${v.ready} ready` : null,
    v.queued ? `${v.queued} in queue` : null,
    v.failed ? `${v.failed} failed` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The catalog: search, group filter and a virtualized list. Selecting a row sets the workspace
 * exercise (after a confirm when the pose or rig editor holds unsaved work). Memoized: the
 * workspace re-renders on every poll, the list only when the catalog or the selection changes.
 */
export const CatalogSidebar = memo(function CatalogSidebar({
  exercises,
  loading,
}: {
  exercises: StudioExercise[];
  loading: boolean;
}) {
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
  const [group, setGroup] = useState<string | null>(null);
  const [onlyWithMovement, setOnlyWithMovement] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const groups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of exercises) if (e.group) seen.set(e.group.code, e.group.name);
    return [...seen.entries()].map(([code, name]) => ({ code, name }));
  }, [exercises]);

  const filtered = useMemo(
    () =>
      exercises.filter(
        (e) =>
          (!group || e.group?.code === group) &&
          (!onlyWithMovement || e.vectors.total > 0) &&
          matches(e, deferredQuery),
      ),
    [exercises, group, onlyWithMovement, deferredQuery],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => filtered[index].id,
  });

  // Keep the selected row in view when the selection comes from elsewhere (URL, keyboard).
  useEffect(() => {
    if (!selectedId) return;
    const index = filtered.findIndex((e) => e.id === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const index = filtered.findIndex((e) => e.id === selectedId);
      const next = event.key === "ArrowDown" ? Math.min(filtered.length - 1, index + 1) : Math.max(0, index - 1);
      if (filtered[next]) selectExercise(filtered[next].id);
    },
    [filtered, selectedId, selectExercise],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--m3-on-surface-variant)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search exercises, muscles, equipment…"
            aria-label="Search exercises"
            type="search"
            className="h-10 w-full rounded-full border border-transparent bg-(--m3-surface-container-high) pl-10 pr-9 text-sm text-(--m3-on-surface) outline-none transition-colors placeholder:text-(--m3-on-surface-variant)/60 focus:border-(--m3-primary)"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="studio-scroll flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Chip selected={group === null} onClick={() => setGroup(null)}>
            All
          </Chip>
          {groups.map((g) => (
            <Chip key={g.code} selected={group === g.code} onClick={() => setGroup(g.code)}>
              {g.name}
            </Chip>
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] text-(--m3-on-surface-variant)">
          <span className="tabular-nums">
            {loading ? "Loading catalog…" : `${filtered.length} of ${exercises.length} exercises`}
          </span>
          <Chip
            selected={onlyWithMovement}
            onClick={() => setOnlyWithMovement((v) => !v)}
            className="h-6"
          >
            With movement
          </Chip>
        </div>
      </div>

      <div ref={parentRef} role="listbox" aria-label="Exercises" className="studio-scroll relative mt-2 min-h-0 flex-1 overflow-y-auto" onKeyDown={onKeyDown}>
        {loading && !exercises.length ? (
          <ul className="space-y-1 px-2 pt-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <li key={i} className="h-[60px] animate-pulse rounded-xl bg-(--m3-surface-container)" />
            ))}
          </ul>
        ) : (
          <div style={{ height: virtualizer.getTotalSize() }} className="relative w-full">
            {virtualizer.getVirtualItems().map((item) => {
              const exercise = filtered[item.index];
              return (
                <Row
                  key={item.key}
                  exercise={exercise}
                  selected={exercise.id === selectedId}
                  onSelect={selectExercise}
                  top={item.start + 2}
                  height={item.size - 4}
                />
              );
            })}
          </div>
        )}
        {!loading && !filtered.length ? (
          <p className="px-6 pt-10 text-center text-xs text-(--m3-on-surface-variant)">
            Nothing matches. Try another word or clear the filters.
          </p>
        ) : null}
      </div>
    </div>
  );
});
