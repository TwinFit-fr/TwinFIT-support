"use client";

import { useLayoutEffect, useRef } from "react";
import {
  CATALOG_LEVELS,
  filterByVisiblePath,
  getLevelByKey,
  pathKey,
  selectionFromVisiblePath,
  valuesForColumn,
  type ExerciseWithPath,
  type LookupRow,
} from "@/lib/catalog/exercise-path";
import { Badge, Button, Card } from "@/components/ui/primitives";
import "./exercise-tree.css";

type LookupMap = Record<string, LookupRow[]>;

type ExerciseColumnExplorerProps = {
  exercises: ExerciseWithPath[];
  muscleGroups: LookupRow[];
  lookups: LookupMap;
  visibleLevelKeys: string[];
  hiddenLevelKeys: Set<string>;
  expanded: Set<string>;
  focusPath: string[];
  extras: Record<string, string[]>;
  onToggleExpand: (pathParts: string[]) => void;
  onAddUnder: (levelKey: string, prefixParts: string[]) => void;
  onReorderLevel: (fromIndex: number, toIndex: number) => void;
  onToggleHidden: (levelKey: string) => void;
  onEditExercise: (exoId: number) => void;
  onCopyExercise: (exoId: number) => void;
  onCreateExercise: (pathParts: string[]) => void;
};

export function ExerciseColumnExplorer({
  exercises,
  muscleGroups,
  lookups,
  visibleLevelKeys,
  hiddenLevelKeys,
  expanded,
  focusPath,
  extras,
  onToggleExpand,
  onAddUnder,
  onReorderLevel,
  onToggleHidden,
  onEditExercise,
  onCopyExercise,
  onCreateExercise,
}: ExerciseColumnExplorerProps) {
  const forestRef = useRef<HTMLDivElement>(null);
  const columnsToShow = visibleLevelKeys.filter((k) => !hiddenLevelKeys.has(k));

  useLayoutEffect(() => {
    layoutTree(forestRef.current);
  }, [expanded, exercises, columnsToShow, focusPath]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm font-medium">Columns</p>
        <p className="mt-1 text-xs text-zinc-500">
          Reorder or hide taxonomy columns. Hidden columns use defaults when creating exercises.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATALOG_LEVELS.map((level) => {
            const orderIndex = visibleLevelKeys.indexOf(level.key);
            const hidden = hiddenLevelKeys.has(level.key);
            return (
              <div
                key={level.key}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${
                  hidden ? "border-zinc-200 bg-zinc-50 text-zinc-400" : "border-zinc-300"
                }`}
              >
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!hidden}
                    onChange={() => onToggleHidden(level.key)}
                  />
                  <span>{level.label}</span>
                </label>
                {!hidden && orderIndex >= 0 && (
                  <span className="ml-1 flex gap-0.5">
                    <button
                      type="button"
                      disabled={orderIndex === 0}
                      onClick={() => onReorderLevel(orderIndex, orderIndex - 1)}
                      className="rounded px-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                      aria-label="Move left"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={orderIndex === columnsToShow.length - 1}
                      onClick={() => onReorderLevel(orderIndex, orderIndex + 1)}
                      className="rounded px-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                      aria-label="Move right"
                    >
                      →
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="catalog-tree-board">
        <div className="flex flex-wrap justify-between gap-2 border-b border-zinc-200 px-3 py-2 text-xs text-zinc-500">
          <span>Click nodes to expand — several branches can be open at once</span>
          {focusPath.length > 0 && (
            <span className="font-medium text-zinc-700">{focusPath.join(" → ")}</span>
          )}
        </div>
        <div className="catalog-tree-scroll">
          <div className="catalog-tree-col-headers" aria-hidden="true">
            {columnsToShow.map((key) => {
              const level = getLevelByKey(key);
              return (
                <div key={key} className="catalog-tree-col-h">
                  {level?.label ?? key}
                </div>
              );
            })}
            <div className="catalog-tree-col-h catalog-tree-col-h-ex">Exercises</div>
          </div>
          <div className="catalog-tree-forest" ref={forestRef}>
            <TreeBranch
              exercises={exercises}
              muscleGroups={muscleGroups}
              lookups={lookups}
              columnsToShow={columnsToShow}
              extras={extras}
              prefixParts={[]}
              depth={0}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onAddUnder={onAddUnder}
              onEditExercise={onEditExercise}
              onCopyExercise={onCopyExercise}
              onCreateExercise={onCreateExercise}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type TreeBranchProps = {
  exercises: ExerciseWithPath[];
  muscleGroups: LookupRow[];
  lookups: LookupMap;
  columnsToShow: string[];
  extras: Record<string, string[]>;
  prefixParts: string[];
  depth: number;
  expanded: Set<string>;
  onToggleExpand: (pathParts: string[]) => void;
  onAddUnder: (levelKey: string, prefixParts: string[]) => void;
  onEditExercise: (exoId: number) => void;
  onCopyExercise: (exoId: number) => void;
  onCreateExercise: (pathParts: string[]) => void;
};

function TreeBranch({
  exercises,
  muscleGroups,
  lookups,
  columnsToShow,
  extras,
  prefixParts,
  depth,
  expanded,
  onToggleExpand,
  onAddUnder,
  onEditExercise,
  onCopyExercise,
  onCreateExercise,
}: TreeBranchProps) {
  if (depth >= columnsToShow.length) {
    const leaves = filterByVisiblePath(exercises, columnsToShow, prefixParts);
    return (
      <div className="catalog-tree-leaves">
        {leaves.length === 0 ? (
          <>
            <p className="catalog-tree-empty">No exercise on this path yet</p>
            <button
              type="button"
              className="catalog-tree-node catalog-tree-node-add"
              onClick={() => onCreateExercise(prefixParts)}
            >
              <span className="catalog-tree-node-label">+ Add exercise</span>
            </button>
          </>
        ) : (
          leaves.map((ex) => (
            <ExerciseCard
              key={ex.exo_id}
              exercise={ex}
              onEdit={() => onEditExercise(ex.exo_id)}
              onCopy={() => onCopyExercise(ex.exo_id)}
            />
          ))
        )}
      </div>
    );
  }

  const levelKey = columnsToShow[depth];
  const level = getLevelByKey(levelKey);
  if (!level) return null;

  const partialSelection = selectionFromVisiblePath(columnsToShow, prefixParts);
  const tableLookups = lookups[level.table] ?? [];
  const nodes = valuesForColumn(
    exercises,
    columnsToShow,
    partialSelection,
    levelKey,
    extras,
    tableLookups,
    muscleGroups,
  );

  return (
    <>
      {nodes.map(({ value, count, name }) => {
        const childPath = [...prefixParts, value];
        const key = pathKey(childPath);
        const isExpanded = expanded.has(key);
        const isEmpty = count === 0;

        return (
          <div key={key} className="catalog-tree-item">
            <div className="catalog-tree-node-row">
              <button
                type="button"
                className={`catalog-tree-node ${isExpanded ? "is-expanded" : ""} ${isEmpty ? "is-empty" : ""}`}
                onClick={() => onToggleExpand(childPath)}
                aria-expanded={isExpanded}
              >
                <span className="min-w-0 flex-1">
                  <span className="catalog-tree-node-label">{value}</span>
                  {name && name !== value && (
                    <span className="catalog-tree-node-sub block">{name}</span>
                  )}
                </span>
                <span className="catalog-tree-node-meta">
                  <span className="catalog-tree-node-count">{count}</span>
                  <span className="catalog-tree-node-chevron">{isExpanded ? "◂" : "▸"}</span>
                </span>
              </button>
              {isExpanded && (
                <>
                  <div className="catalog-tree-link" />
                  <div className="catalog-tree-children">
                    <div className="catalog-tree-children-stack">
                      <TreeBranch
                        exercises={exercises}
                        muscleGroups={muscleGroups}
                        lookups={lookups}
                        columnsToShow={columnsToShow}
                        extras={extras}
                        prefixParts={childPath}
                        depth={depth + 1}
                        expanded={expanded}
                        onToggleExpand={onToggleExpand}
                        onAddUnder={onAddUnder}
                        onEditExercise={onEditExercise}
                        onCopyExercise={onCopyExercise}
                        onCreateExercise={onCreateExercise}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="catalog-tree-node catalog-tree-node-add"
        onClick={() => onAddUnder(levelKey, prefixParts)}
      >
        <span className="catalog-tree-node-label">+ Add value</span>
      </button>
    </>
  );
}

function ExerciseCard({
  exercise,
  onEdit,
  onCopy,
}: {
  exercise: ExerciseWithPath;
  onEdit: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="shrink-0 font-mono text-xs text-zinc-500">#{exercise.exo_id}</span>
        <Badge
          className={
            exercise.taxonomy_status === "pending" ? "bg-amber-100 text-amber-800" : ""
          }
        >
          {exercise.taxonomy_status}
        </Badge>
      </div>
      <p className="mt-1 truncate font-medium leading-snug">{exercise.display_name}</p>
      <div className="mt-2 flex gap-3">
        <button type="button" onClick={onEdit} className="text-sm underline">
          Edit
        </button>
        <button type="button" onClick={onCopy} className="text-sm underline">
          Copy
        </button>
      </div>
    </div>
  );
}

function connectorAnchor(child: Element): Element {
  if (child.classList.contains("catalog-tree-node-add")) return child;
  if (child.classList.contains("catalog-tree-leaves")) {
    return child.querySelector(".min-w-0.rounded-lg") || child;
  }
  return (
    child.querySelector(":scope > .catalog-tree-node-row > .catalog-tree-node") ||
    child.querySelector(".catalog-tree-node") ||
    child
  );
}

function midY(el: Element, relativeTo: Element): number {
  const a = el.getBoundingClientRect();
  const b = relativeTo.getBoundingClientRect();
  return a.top + a.height / 2 - b.top;
}

function layoutTree(forestEl: HTMLElement | null) {
  if (!forestEl) return;

  forestEl.querySelectorAll(".catalog-tree-item").forEach((item) => {
    (item as HTMLElement).style.paddingTop = "";
  });
  forestEl.querySelectorAll(".catalog-tree-node-row").forEach((row) => {
    (row as HTMLElement).style.paddingTop = "";
  });
  forestEl.querySelectorAll(".catalog-tree-children-stack").forEach((stack) => {
    const el = stack as HTMLElement;
    el.style.marginTop = "";
    el.style.removeProperty("--spine-top");
    el.style.removeProperty("--spine-bottom");
  });

  const stacks = [...forestEl.querySelectorAll(".catalog-tree-children-stack")].reverse();
  for (const stack of stacks) {
    const row = stack.closest(".catalog-tree-node-row");
    const item = row?.closest(".catalog-tree-item");
    const parentBtn = row?.querySelector(":scope > .catalog-tree-node");
    if (!row || !parentBtn || !item) continue;

    const ph = (parentBtn as HTMLElement).offsetHeight;
    const sh = (stack as HTMLElement).offsetHeight;
    const offset = Math.round((ph - sh) / 2);
    const itemEl = item as HTMLElement;
    const stackEl = stack as HTMLElement;

    if (offset < 0) {
      itemEl.style.paddingTop = `${-offset}px`;
      stackEl.style.marginTop = `${offset}px`;
    } else {
      stackEl.style.marginTop = `${offset}px`;
    }

    const kids = [...stack.children];
    if (!kids.length) continue;

    const firstMid = midY(connectorAnchor(kids[0]), stack);
    const lastMid = midY(connectorAnchor(kids[kids.length - 1]), stack);
    stackEl.style.setProperty("--spine-top", `${Math.round(firstMid)}px`);
    stackEl.style.setProperty(
      "--spine-bottom",
      `${Math.round(stackEl.offsetHeight - lastMid)}px`,
    );

    kids.forEach((kid) => {
      if (!kid.classList.contains("catalog-tree-leaves")) return;
      const leaf = kid.querySelector(".min-w-0.rounded-lg");
      if (!leaf) return;
      const stubY = midY(leaf, kid);
      (kid as HTMLElement).style.setProperty("--tree-leaf-stub-y", `${Math.round(stubY)}px`);
    });
  }
}
