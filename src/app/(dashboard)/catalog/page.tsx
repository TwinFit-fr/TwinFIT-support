"use client";

import { useMemo, useState } from "react";
import { ExerciseBrowser } from "@/components/catalog/exercise-browser";
import { ExerciseComposeDialog } from "@/components/catalog/exercise-compose-dialog";
import { Button, Card, Input } from "@/components/ui/primitives";
import { withExercisePaths, type ExerciseWithPath, type LookupRow } from "@/lib/catalog/exercise-path";
import type { CatalogLocale, LocalizationRow } from "@/lib/catalog/locales";
import { useStaffSWR } from "@/hooks/use-staff-fetch";

type LocalizedLookupRow = LookupRow & {
  localizations?: LocalizationRow[];
};

type CatalogExercise = {
  exo_id: number;
  display_name: string;
  taxonomy_status: string;
  primary_muscle_group?: { code: string };
  movement_type?: { code: string };
  equipment?: { code: string };
  support_equipment?: { code: string } | null;
  position?: { code: string };
  grip?: { code: string };
  variation?: { code: string };
  load_modality?: { code: string };
  localizations?: LocalizationRow[];
};

type TaxonomyData = {
  catalog_muscle_groups: LocalizedLookupRow[];
  catalog_movement_types: LocalizedLookupRow[];
  catalog_equipment: LocalizedLookupRow[];
  catalog_support_equipment: LocalizedLookupRow[];
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

export default function CatalogPage() {
  const library = useStaffSWR<{ data: { catalog_exercises: CatalogExercise[] } }>(
    "/api/catalog/library",
  );
  const taxonomyQuery = useStaffSWR<{ data: TaxonomyData }>("/api/catalog/taxonomy");
  const [filter, setFilter] = useState("");
  const [locale, setLocale] = useState<CatalogLocale>("en");
  const [status, setStatus] = useState<string | null>(null);
  const [composeDialog, setComposeDialog] = useState<ComposeDialogState>({ open: false });

  const exercises = useMemo(
    () =>
      withExercisePaths(library.data?.data.catalog_exercises ?? []) as Array<
        ExerciseWithPath & {
          support_equipment?: { code: string } | null;
          localizations?: LocalizationRow[];
        }
      >,
    [library.data],
  );
  const taxonomy = taxonomyQuery.data?.data ?? null;
  const loading = library.isLoading || taxonomyQuery.isLoading;
  const loadError = library.error ?? taxonomyQuery.error;
  const error = loadError ? loadError.message || "Failed to load catalog" : null;

  function reload() {
    void library.mutate();
    void taxonomyQuery.mutate();
  }

  const lookupMap = useMemo(() => {
    if (!taxonomy) return {} as Record<string, LookupRow[]>;
    return {
      catalog_muscle_groups: taxonomy.catalog_muscle_groups,
      catalog_movement_types: taxonomy.catalog_movement_types,
      catalog_equipment: taxonomy.catalog_equipment,
      catalog_support_equipment: taxonomy.catalog_support_equipment,
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
        <ExerciseBrowser
          exercises={exercises}
          lookups={lookupMap}
          search={filter}
          locale={locale}
          onLocaleChange={setLocale}
          onEditExercise={openEditExercise}
          onCopyExercise={openCopyExercise}
          onCreateExercise={openCreateExercise}
        />
      )}

      <ExerciseComposeDialog
        key={composeDialogKey}
        open={composeDialog.open}
        editExoId={composeDialog.editExoId}
        copyFromExoId={composeDialog.copyFromExoId}
        createFromSelection={composeDialog.createFromSelection}
        onClose={() => setComposeDialog({ open: false })}
        onSaved={(msg) => {
          setStatus(msg);
          reload();
        }}
      />
    </div>
  );
}
