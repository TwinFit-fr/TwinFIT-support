"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import {
  buildPathFromForm,
  exerciseFingerprintFromCatalog,
  exerciseTaxonomyPath,
  formCreateFingerprint,
  fullPathFromSelection,
  pathsEqual,
  withExercisePaths,
  type ExerciseWithPath,
} from "@/lib/catalog/exercise-path";
import { useIsAdmin } from "@/hooks/use-is-staff";
import { useStaffFetch } from "@/hooks/use-staff-fetch";

export type LookupRow = { code: string; name: string };

type MuscleGroup = {
  code: string;
  group_muscles: Array<{ role: string; muscle: { code: string } }>;
};

type CatalogExerciseRow = {
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
  target_muscle?: { code: string };
  localizations?: Array<{ description?: string | null }>;
};

export type ExerciseFormState = {
  display_name: string;
  primary_muscle_group_code: string;
  movement_type_code: string;
  equipment_code: string;
  position_code: string;
  grip_code: string;
  variation_code: string;
  load_modality_code: string;
  target_muscle_code: string;
  taxonomy_status: string;
  description: string;
};

const DEFAULT_FORM: ExerciseFormState = {
  display_name: "",
  primary_muscle_group_code: "CHEST",
  movement_type_code: "PRESS",
  equipment_code: "BARBELL",
  position_code: "NEUTRAL",
  grip_code: "STANDARD",
  variation_code: "STANDARD",
  load_modality_code: "",
  target_muscle_code: "",
  taxonomy_status: "migrated",
  description: "",
};

type ExerciseComposeFormProps = {
  editExoId?: number | null;
  copyFromExoId?: number | null;
  createFromSelection?: Record<string, string>;
  onSuccess: (message: string) => void;
  onCancel: () => void;
};

export function ExerciseComposeForm({
  editExoId,
  copyFromExoId,
  createFromSelection,
  onSuccess,
  onCancel,
}: ExerciseComposeFormProps) {
  const staffFetch = useStaffFetch();
  const isAdmin = useIsAdmin();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [lookups, setLookups] = useState<{
    muscle_groups: LookupRow[];
    movement_types: LookupRow[];
    equipment: LookupRow[];
    positions: LookupRow[];
    grips: LookupRow[];
    variations: LookupRow[];
    load_modalities: LookupRow[];
    muscles: LookupRow[];
  }>({
    muscle_groups: [],
    movement_types: [],
    equipment: [],
    positions: [],
    grips: [],
    variations: [],
    load_modalities: [],
    muscles: [],
  });
  const [form, setForm] = useState<ExerciseFormState>(DEFAULT_FORM);
  const [allExercises, setAllExercises] = useState<ExerciseWithPath[]>([]);
  const [copySource, setCopySource] = useState<CatalogExerciseRow | null>(null);
  const [nextExoId, setNextExoId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isCreate = !editExoId;
  const isCopy = isCreate && copyFromExoId != null;

  useEffect(() => {
    async function loadLookups() {
      const [libRes, taxRes] = await Promise.all([
        staffFetch("/api/catalog/library") as Promise<{
          data: {
            catalog_muscle_groups: LookupRow[];
            catalog_movement_types: LookupRow[];
            catalog_equipment: LookupRow[];
            catalog_muscles: LookupRow[];
            catalog_exercises: CatalogExerciseRow[];
          };
        }>,
        staffFetch("/api/catalog/taxonomy") as Promise<{
          data: {
            catalog_muscle_groups: MuscleGroup[];
            catalog_positions: LookupRow[];
            catalog_grips: LookupRow[];
            catalog_variations: LookupRow[];
            catalog_load_modalities: LookupRow[];
          };
        }>,
      ]);

      const exercises = withExercisePaths(libRes.data.catalog_exercises ?? []);
      setAllExercises(exercises);

      setLookups({
        muscle_groups: libRes.data.catalog_muscle_groups ?? [],
        movement_types: libRes.data.catalog_movement_types ?? [],
        equipment: libRes.data.catalog_equipment ?? [],
        positions: taxRes.data.catalog_positions ?? [],
        grips: taxRes.data.catalog_grips ?? [],
        variations: taxRes.data.catalog_variations ?? [],
        load_modalities: taxRes.data.catalog_load_modalities ?? [],
        muscles: libRes.data.catalog_muscles ?? [],
      });

      if (editExoId) {
        const ex = libRes.data.catalog_exercises.find((row) => row.exo_id === editExoId);
        if (ex) {
          setForm(formFromExercise(ex));
        }
        setCopySource(null);
      } else if (copyFromExoId != null) {
        const ex = libRes.data.catalog_exercises.find((row) => row.exo_id === copyFromExoId);
        if (ex) {
          setForm(formFromExercise(ex));
          setCopySource(ex);
        } else {
          setForm(DEFAULT_FORM);
          setCopySource(null);
        }
        setTimeout(() => nameInputRef.current?.focus(), 100);
      } else if (createFromSelection && Object.keys(createFromSelection).length > 0) {
        const fullPath = fullPathFromSelection(createFromSelection);
        const groups = taxRes.data.catalog_muscle_groups ?? [];
        const mgCode = fullPath[0] || "CHEST";
        const group = groups.find((g) => g.code === mgCode);
        const firstTarget =
          group?.group_muscles?.find((gm) => gm.role === "target")?.muscle?.code ?? "";

        setForm({
          ...DEFAULT_FORM,
          primary_muscle_group_code: fullPath[0] || DEFAULT_FORM.primary_muscle_group_code,
          movement_type_code: fullPath[1] || DEFAULT_FORM.movement_type_code,
          equipment_code: fullPath[2] || DEFAULT_FORM.equipment_code,
          position_code: fullPath[3] || "NEUTRAL",
          grip_code: fullPath[4] || "STANDARD",
          variation_code: fullPath[5] || "STANDARD",
          load_modality_code: fullPath[6] || "",
          target_muscle_code: firstTarget,
        });
        setCopySource(null);
        setTimeout(() => nameInputRef.current?.focus(), 100);
      } else {
        setForm(DEFAULT_FORM);
        setCopySource(null);
      }

      if (!editExoId) {
        try {
          const nextRes = (await staffFetch(
            "/api/catalog/library?nextExoId=1",
          )) as { exo_id: number };
          if (Number.isFinite(nextRes.exo_id)) setNextExoId(nextRes.exo_id);
        } catch {
          /* optional */
        }
      }
    }
    void loadLookups().catch((err) => {
      setMessage(err instanceof Error ? err.message : "Failed to load lookups");
    });
  }, [staffFetch, editExoId, copyFromExoId, createFromSelection]);

  const copyValidation = useMemo(() => {
    if (!isCopy || !copySource) {
      return { warnings: [] as string[], canCreate: true };
    }

    const name = form.display_name.trim();
    const nameKey = name.toLowerCase();
    const warnings: string[] = [];

    const nameDup = allExercises.find(
      (e) => e.display_name.trim().toLowerCase() === nameKey,
    );
    if (nameDup) {
      warnings.push(`Display name already used by exo_id #${nameDup.exo_id}`);
    }

    const sourceNameKey = copySource.display_name.trim().toLowerCase();
    if (nameKey && nameKey === sourceNameKey) {
      warnings.push("Display name must differ from the copied exercise");
    }

    const formPath = buildPathFromForm(form);
    const pathDup = allExercises.find((ex) =>
      pathsEqual(formPath, exerciseTaxonomyPath(ex)),
    );
    if (pathDup) {
      warnings.push(
        `This taxonomy combination already exists on #${pathDup.exo_id}: ${pathDup.display_name}`,
      );
    }

    const formFp = formCreateFingerprint(form);
    const sourceFp = exerciseFingerprintFromCatalog(copySource);
    if (formFp === sourceFp) {
      warnings.push("Change at least one field from the copied exercise before creating");
    }

    const canCreate =
      name.length > 0 &&
      !nameDup &&
      nameKey !== sourceNameKey &&
      formFp !== sourceFp;

    return { warnings, canCreate };
  }, [isCopy, copySource, form, allExercises]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (isCopy && !copyValidation.canCreate) {
      setMessage(copyValidation.warnings[0] ?? "Fix validation errors before creating");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        secondary_muscle_codes: [],
      };
      if (form.load_modality_code) {
        payload.load_modality_code = form.load_modality_code;
      }
      if (editExoId) {
        await staffFetch("/api/catalog/update", {
          method: "POST",
          body: JSON.stringify({ ...payload, exo_id: editExoId }),
        });
        onSuccess("Exercise updated.");
      } else {
        await staffFetch("/api/catalog/library", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        onSuccess("Exercise created.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  async function deactivate() {
    if (!editExoId) return;
    setLoading(true);
    setMessage(null);
    try {
      await staffFetch("/api/catalog/deactivate", {
        method: "POST",
        body: JSON.stringify({ exo_id: editExoId }),
      });
      onSuccess("Exercise deactivated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setLoading(false);
    }
  }

  const submitDisabled =
    loading || (isCopy && !copyValidation.canCreate);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {isCreate && nextExoId != null && (
        <p className="text-sm text-zinc-500">Next exo_id: #{nextExoId}</p>
      )}
      {editExoId && (
        <p className="text-sm text-zinc-500">Editing exo_id #{editExoId}</p>
      )}
      {isCopy && copySource && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Prefilled from &ldquo;{copySource.display_name}&rdquo; (#{copyFromExoId}). Change the
          display name and at least one other field before creating.
        </p>
      )}
      {isCopy && copyValidation.warnings.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {copyValidation.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <Card className="grid gap-4 md:grid-cols-2">
        <Field label="Display name">
          <Input
            ref={nameInputRef}
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            required
          />
        </Field>
        <Field label="Taxonomy status">
          <select
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            value={form.taxonomy_status}
            onChange={(e) => setForm({ ...form, taxonomy_status: e.target.value })}
          >
            <option value="migrated">migrated</option>
            <option value="pending">pending</option>
          </select>
        </Field>
        <LookupSelect
          label="Muscle group"
          value={form.primary_muscle_group_code}
          options={lookups.muscle_groups}
          onChange={(value) => setForm({ ...form, primary_muscle_group_code: value })}
        />
        <LookupSelect
          label="Movement type"
          value={form.movement_type_code}
          options={lookups.movement_types}
          onChange={(value) => setForm({ ...form, movement_type_code: value })}
        />
        <LookupSelect
          label="Equipment"
          value={form.equipment_code}
          options={lookups.equipment}
          onChange={(value) => setForm({ ...form, equipment_code: value })}
        />
        <LookupSelect
          label="Position"
          value={form.position_code}
          options={lookups.positions}
          onChange={(value) => setForm({ ...form, position_code: value })}
        />
        <LookupSelect
          label="Grip"
          value={form.grip_code}
          options={lookups.grips}
          onChange={(value) => setForm({ ...form, grip_code: value })}
        />
        <LookupSelect
          label="Variation"
          value={form.variation_code}
          options={lookups.variations}
          onChange={(value) => setForm({ ...form, variation_code: value })}
        />
        <LookupSelect
          label="Load modality"
          value={form.load_modality_code}
          options={lookups.load_modalities}
          onChange={(value) => setForm({ ...form, load_modality_code: value })}
          allowEmpty
        />
        <LookupSelect
          label="Target muscle"
          value={form.target_muscle_code}
          options={lookups.muscles}
          onChange={(value) => setForm({ ...form, target_muscle_code: value })}
        />
        <Field label="Description (EN)" className="md:col-span-2">
          <textarea
            className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
      </Card>
      {message && <p className="text-sm text-red-600">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={submitDisabled}>
          {loading ? "Saving…" : editExoId ? "Update exercise" : "Create exercise"}
        </Button>
        {editExoId && form.taxonomy_status === "pending" && isAdmin && (
          <Button type="button" variant="danger" onClick={deactivate} disabled={loading}>
            Deactivate
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function formFromExercise(ex: CatalogExerciseRow): ExerciseFormState {
  return {
    display_name: ex.display_name,
    primary_muscle_group_code: ex.primary_muscle_group?.code ?? "CHEST",
    movement_type_code: ex.movement_type?.code ?? "PRESS",
    equipment_code: ex.equipment?.code ?? "BARBELL",
    position_code: ex.position?.code ?? "NEUTRAL",
    grip_code: ex.grip?.code ?? "STANDARD",
    variation_code: ex.variation?.code ?? "STANDARD",
    load_modality_code: ex.load_modality?.code ?? "",
    target_muscle_code: ex.target_muscle?.code ?? "",
    taxonomy_status: ex.taxonomy_status,
    description: ex.localizations?.[0]?.description ?? "",
  };
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function LookupSelect({
  label,
  value,
  options,
  onChange,
  allowEmpty,
}: {
  label: string;
  value: string;
  options: LookupRow[];
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty && <option value="">— (infer)</option>}
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.code} — {opt.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
