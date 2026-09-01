"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AddNodeDialog } from "@/components/catalog/add-node-dialog";
import { ExerciseComposeDialog } from "@/components/catalog/exercise-compose-dialog";
import { ExerciseColumnExplorer } from "@/components/catalog/exercise-column-explorer";
import { Button, Card, Input } from "@/components/ui/primitives";
import {
  defaultVisibleLevelKeys,
  filterByVisiblePath,
  getLevelByKey,
  isVisiblePathComplete,
  pathKey,
  rememberExtra,
  selectionFromVisiblePath,
  valuesForColumn,
  withExercisePaths,
  type ExerciseWithPath,
  type LookupRow,
} from "@/lib/catalog/exercise-path";
import { useStaffFetch } from "@/hooks/use-staff-fetch";

type CatalogExercise = {
  exo_id: number;
  display_name: string;
  taxonomy_status: string;
  primary_muscle_group?: { code: string };
  movement_type?: { code: string };
  equipment?: { code: string };
  position?: { code: string };
  grip?: { code: string };
  variation?: { code: string };
  load_modality?: { code: string };
};

type TaxonomyData = {
  catalog_muscle_groups: LookupRow[];
  catalog_movement_types: LookupRow[];
  catalog_equipment: LookupRow[];
  catalog_positions: LookupRow[];
  catalog_grips: LookupRow[];
  catalog_variations: LookupRow[];
  catalog_load_modalities: LookupRow[];
};

type ComposeDialogState = {
  open: boolean;
  editExoId?: number | null;
  copyFromExoId?: number | null;
  createFromSelection?: Record<string, string>;
};

const TAXONOMY_KEY_BY_TABLE: Record<string, keyof TaxonomyData> = {
  catalog_muscle_groups: "catalog_muscle_groups",
  catalog_movement_types: "catalog_movement_types",
  catalog_equipment: "catalog_equipment",
  catalog_positions: "catalog_positions",
  catalog_grips: "catalog_grips",
  catalog_variations: "catalog_variations",
  catalog_load_modalities: "catalog_load_modalities",
};

export default function CatalogPage() {
  const staffFetch = useStaffFetch();
  const [exercises, setExercises] = useState<ExerciseWithPath[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<LookupRow[]>([]);
  const [taxonomy, setTaxonomy] = useState<TaxonomyData | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extras, setExtras] = useState<Record<string, string[]>>({});
  const [visibleLevelKeys, setVisibleLevelKeys] = useState<string[]>(defaultVisibleLevelKeys());
  const [hiddenLevelKeys, setHiddenLevelKeys] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusPath, setFocusPath] = useState<string[]>([]);
  const [addContext, setAddContext] = useState<{
    levelKey: string;
    prefixParts: string[];
  } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [composeDialog, setComposeDialog] = useState<ComposeDialogState>({ open: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [libRes, taxRes] = await Promise.all([
        staffFetch("/api/catalog/library") as Promise<{
          data: {
            catalog_exercises: CatalogExercise[];
            catalog_muscle_groups: LookupRow[];
          };
        }>,
        staffFetch("/api/catalog/taxonomy") as Promise<{ data: TaxonomyData }>,
      ]);
      const raw = libRes.data.catalog_exercises ?? [];
      setExercises(withExercisePaths(raw));
      setMuscleGroups(libRes.data.catalog_muscle_groups ?? []);
      setTaxonomy(taxRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, [staffFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter(
      (ex) =>
        ex.display_name.toLowerCase().includes(q) ||
        String(ex.exo_id).includes(q) ||
        ex.primary_muscle_group?.code.toLowerCase().includes(q),
    );
  }, [exercises, filter]);

  const columnsToShow = useMemo(
    () => visibleLevelKeys.filter((k) => !hiddenLevelKeys.has(k)),
    [visibleLevelKeys, hiddenLevelKeys],
  );

  const lookupMap: Record<string, LookupRow[]> = useMemo(() => {
    if (!taxonomy) return {} as Record<string, LookupRow[]>;
    return {
      catalog_muscle_groups: taxonomy.catalog_muscle_groups,
      catalog_movement_types: taxonomy.catalog_movement_types,
      catalog_equipment: taxonomy.catalog_equipment,
      catalog_positions: taxonomy.catalog_positions,
      catalog_grips: taxonomy.catalog_grips,
      catalog_variations: taxonomy.catalog_variations,
      catalog_load_modalities: taxonomy.catalog_load_modalities,
    };
  }, [taxonomy]);

  function openEditExercise(exoId: number) {
    setComposeDialog({ open: true, editExoId: exoId });
  }

  function openCopyExercise(exoId: number) {
    setComposeDialog({ open: true, editExoId: null, copyFromExoId: exoId });
  }

  function openCreateExercise(fromSelection?: Record<string, string>) {
    setComposeDialog({
      open: true,
      editExoId: null,
      createFromSelection: fromSelection,
    });
  }

  function openCreateExerciseFromPath(pathParts: string[]) {
    openCreateExercise(selectionFromVisiblePath(columnsToShow, pathParts));
  }

  function closeComposeDialog() {
    setComposeDialog({ open: false });
  }

  function toggleExpand(pathParts: string[]) {
    const key = pathKey(pathParts);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setFocusPath(pathParts);
  }

  function openAddUnder(levelKey: string, prefixParts: string[]) {
    setAddContext({ levelKey, prefixParts });
  }

  function reorderLevel(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= columnsToShow.length) return;
    const fromKey = columnsToShow[fromIndex];
    const toKey = columnsToShow[toIndex];
    setVisibleLevelKeys((prev) => {
      const next = [...prev];
      const fromGlobal = next.indexOf(fromKey);
      const toGlobal = next.indexOf(toKey);
      if (fromGlobal < 0 || toGlobal < 0) return prev;
      next.splice(fromGlobal, 1);
      next.splice(toGlobal, 0, fromKey);
      return next;
    });
    setExpanded(new Set());
    setFocusPath([]);
  }

  function toggleHidden(levelKey: string) {
    setHiddenLevelKeys((prev) => {
      const next = new Set(prev);
      if (next.has(levelKey)) next.delete(levelKey);
      else next.add(levelKey);
      return next;
    });
    setExpanded(new Set());
    setFocusPath([]);
  }

  async function applyValues(levelKey: string, prefixParts: string[], values: string[]) {
    const level = getLevelByKey(levelKey);
    if (!level || !taxonomy) return;

    const prefixPartsForExtra = prefixParts;
    let nextExtras = { ...extras };
    const cleaned: string[] = [];
    const seen = new Set<string>();

    for (const raw of values) {
      const v = raw.trim().toUpperCase().replace(/\s+/g, " ");
      if (!v || seen.has(v)) continue;
      seen.add(v);
      cleaned.push(v);
      nextExtras = rememberExtra(nextExtras, prefixPartsForExtra, v);
    }

    setExtras(nextExtras);
    setAddContext(null);

    try {
      for (const v of cleaned) {
        await staffFetch("/api/catalog/taxonomy", {
          method: "POST",
          body: JSON.stringify({ table: level.table, code: v, name: v.replace(/_/g, " ") }),
        });
      }
      await load();
      setStatus(`Added ${cleaned.join(", ")}`);

      if (cleaned.length === 1) {
        const newPathParts = [...prefixParts, cleaned[0]];
        const newKey = pathKey(newPathParts);
        setExpanded((prev) => new Set([...prev, newKey]));
        setFocusPath(newPathParts);

        if (isVisiblePathComplete(columnsToShow, newPathParts)) {
          const leaves = filterByVisiblePath(filtered, columnsToShow, newPathParts);
          if (leaves.length === 0) {
            openCreateExerciseFromPath(newPathParts);
          }
        }
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to add values");
    }
  }

  const addDialogLookup = useMemo(() => {
    if (!addContext || !taxonomy) return [];
    const level = getLevelByKey(addContext.levelKey);
    if (!level) return [];
    const key = TAXONOMY_KEY_BY_TABLE[level.table];
    return taxonomy[key] ?? [];
  }, [addContext, taxonomy]);

  const addDialogPrefix = addContext?.prefixParts ?? [];

  const addDialogUsed = useMemo(() => {
    if (!addContext) return new Set<string>();
    const tableLookups =
      getLevelByKey(addContext.levelKey)
        ? lookupMap[getLevelByKey(addContext.levelKey)!.table] ?? []
        : [];
    const partialSelection = selectionFromVisiblePath(
      columnsToShow,
      addContext.prefixParts,
    );
    return new Set(
      valuesForColumn(
        filtered,
        columnsToShow,
        partialSelection,
        addContext.levelKey,
        extras,
        tableLookups,
        muscleGroups,
      ).map((x) => x.value),
    );
  }, [addContext, filtered, columnsToShow, extras, lookupMap, muscleGroups]);

  const composeDialogKey = composeDialog.open
    ? composeDialog.editExoId != null
      ? `edit-${composeDialog.editExoId}`
      : composeDialog.copyFromExoId != null
        ? `copy-${composeDialog.copyFromExoId}`
        : `create-${JSON.stringify(composeDialog.createFromSelection ?? {})}`
    : "closed";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Exercise catalog</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {exercises.length} active system exercises
          </p>
        </div>
        <Button type="button" onClick={() => openCreateExercise()}>
          New exercise
        </Button>
      </div>

      <Card>
        <Input
          placeholder="Filter by name, exo_id, muscle group…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </Card>

      {loading && <p className="text-sm text-zinc-500">Loading catalog…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {status && <p className="text-sm text-zinc-600">{status}</p>}

      {!loading && !error && (
        <ExerciseColumnExplorer
          exercises={filtered}
          muscleGroups={muscleGroups}
          lookups={lookupMap}
          visibleLevelKeys={visibleLevelKeys}
          hiddenLevelKeys={hiddenLevelKeys}
          expanded={expanded}
          focusPath={focusPath}
          extras={extras}
          onToggleExpand={toggleExpand}
          onAddUnder={openAddUnder}
          onReorderLevel={reorderLevel}
          onToggleHidden={toggleHidden}
          onEditExercise={openEditExercise}
          onCopyExercise={openCopyExercise}
          onCreateExercise={openCreateExerciseFromPath}
        />
      )}

      {addContext && (
        <AddNodeDialog
          levelKey={addContext.levelKey}
          prefixParts={addDialogPrefix}
          lookupCodes={addDialogLookup}
          usedValues={addDialogUsed}
          onConfirm={(values) =>
            void applyValues(addContext.levelKey, addContext.prefixParts, values)
          }
          onCancel={() => setAddContext(null)}
        />
      )}

      <ExerciseComposeDialog
        key={composeDialogKey}
        open={composeDialog.open}
        editExoId={composeDialog.editExoId}
        copyFromExoId={composeDialog.copyFromExoId}
        createFromSelection={composeDialog.createFromSelection}
        onClose={closeComposeDialog}
        onSaved={(msg) => {
          setStatus(msg);
          void load();
        }}
      />
    </div>
  );
}
