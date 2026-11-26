"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import {
  exerciseFingerprintFromCatalog,
  formCreateFingerprint,
  fullPathFromSelection,
  withExercisePaths,
  type ExerciseWithPath,
} from "@/lib/catalog/exercise-path";
import {
  CATALOG_LOCALES,
  emptyLocaleFields,
  resolveLocalizedName,
  type CatalogLocale,
  type LocalizationRow,
} from "@/lib/catalog/locales";
import {
  DEFAULT_GRIP_CODE,
  FACET_DEFAULTS,
  FACET_HINTS,
  INCLINATIONS,
  LATERALITIES,
  UNCLASSIFIED_GRIP_CODE,
  WIDTHS,
  findFacetTupleDuplicate,
  gripEvidence,
  selectableOptions,
  type Inclination,
  type Laterality,
  type Width,
} from "@/lib/catalog/facets";
import {
  MuscleSetChips,
  MuscleSetEditor,
  type MuscleSet,
} from "@/components/catalog/muscle-set-editor";
import {
  duplicateNameErrors,
  exerciseGuardRailErrors,
  parseBodyMassCoefficient,
  parsePulleyRatio,
} from "@/lib/catalog/guard-rails";
import type { HistoryEntry } from "@/lib/catalog/history";
import { inferLoggingModeCode } from "@/lib/catalog/normalize";
import { useIsAdmin } from "@/hooks/use-is-staff";
import { useStaffFetch } from "@/hooks/use-staff-fetch";

export type LookupRow = {
  code: string;
  name: string;
  active?: boolean;
  sort_order?: number;
  /** Grips (backend 2.10.0): names per locale. */
  localizations?: LocalizationRow[];
};

type PoseRow = { position: number; pose: string };

type MuscleGroup = {
  code: string;
  kind?: string | null;
  group_muscles: Array<{ role: string; muscle: { code: string } }>;
  group_movement_types: Array<{
    movement_type: { code: string };
    target_muscle?: { code: string } | null;
    secondary_muscles?: Array<{ muscle: { code: string } }>;
    target_profiles?: Array<{
      target_muscle: { code: string };
      secondary_muscles?: Array<{ muscle: { code: string } }>;
    }>;
  }>;
};

const pairKey = (groupCode: string, movementCode: string) => `${groupCode}::${movementCode}`;

/** A pair's muscles and its target profiles (another target with its own secondaries). */
type PairMuscles = MuscleSet & { profiles: MuscleSet[] };

type ExerciseDetail = {
  muscles_custom_reason: string | null;
  history: HistoryEntry[];
};

type CatalogExerciseRow = {
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
  logging_mode?: { code: string };
  width?: string | null;
  inclination?: string | null;
  laterality?: string | null;
  app_visible?: boolean | null;
  body_mass_coefficient?: number | null;
  default_pulley_ratio?: number | null;
  target_muscle?: { code: string };
  muscles_inherited?: boolean;
  resolved_muscles?: Array<{ role: string; muscle: { code: string } }>;
  localizations?: Array<{
    locale: string;
    display_name?: string | null;
    description?: string | null;
  }>;
};

export type ExerciseFormState = {
  display_name: string;
  primary_muscle_group_code: string;
  movement_type_code: string;
  equipment_code: string;
  support_equipment_code: string;
  position_code: string;
  grip_code: string;
  variation_code: string;
  load_modality_code: string;
  /** Facets of backend 2.10.0 (closed lists). */
  width: Width;
  inclination: Inclination;
  laterality: Laterality;
  /** false: the app does not list it (Resting); the Lab and set history still see it. */
  app_visible: boolean;
  target_muscle_code: string;
  /** Custom muscles only; an inherited exercise shows its pair's. */
  secondary_muscle_codes: string[];
  muscles_inherited: boolean;
  /** Required when the muscles are custom (backend 2.10.0). */
  muscles_custom_reason: string;
  /** C_ex: empty, or a number in (0, 1]. */
  body_mass_coefficient: string;
  /** 1 unless the exercise is on CABLE. */
  default_pulley_ratio: string;
  taxonomy_status: string;
  localizations: Record<
    CatalogLocale,
    { display_name: string; description: string }
  >;
};

const DEFAULT_FORM: ExerciseFormState = {
  display_name: "",
  primary_muscle_group_code: "CHEST",
  movement_type_code: "PRESS",
  equipment_code: "BARBELL",
  support_equipment_code: "",
  position_code: "",
  grip_code: DEFAULT_GRIP_CODE,
  variation_code: "STANDARD",
  load_modality_code: "",
  ...FACET_DEFAULTS,
  target_muscle_code: "",
  secondary_muscle_codes: [],
  muscles_inherited: true,
  muscles_custom_reason: "",
  body_mass_coefficient: "",
  default_pulley_ratio: "1",
  taxonomy_status: "migrated",
  localizations: emptyLocaleFields(),
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
    support_equipment: LookupRow[];
    positions: LookupRow[];
    grips: LookupRow[];
    variations: LookupRow[];
    load_modalities: LookupRow[];
    muscles: LookupRow[];
  }>({
    muscle_groups: [],
    movement_types: [],
    equipment: [],
    support_equipment: [],
    positions: [],
    grips: [],
    variations: [],
    load_modalities: [],
    muscles: [],
  });
  const [form, setForm] = useState<ExerciseFormState>(DEFAULT_FORM);
  const [pairMuscles, setPairMuscles] = useState<Map<string, PairMuscles>>(new Map());
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  /** The exercise as loaded (edit): its pair and logging mode, which the form does not change. */
  const [original, setOriginal] = useState<CatalogExerciseRow | null>(null);
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [allExercises, setAllExercises] = useState<ExerciseWithPath[]>([]);
  const [copySource, setCopySource] = useState<CatalogExerciseRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [localeTab, setLocaleTab] = useState<CatalogLocale>("en");
  /** The pose texts of the edited exercise: the evidence for a grip left STANDARD. */
  const [poses, setPoses] = useState<PoseRow[]>([]);

  const isCreate = !editExoId;
  const isCopy = isCreate && copyFromExoId != null;

  useEffect(() => {
    async function loadLookups() {
      setPoses([]);
      const [libRes, taxRes] = await Promise.all([
        staffFetch("/api/catalog/library") as Promise<{
          data: {
            catalog_muscle_groups: LookupRow[];
            catalog_movement_types: LookupRow[];
            catalog_equipment: LookupRow[];
            catalog_support_equipment: LookupRow[];
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
        support_equipment: libRes.data.catalog_support_equipment ?? [],
        positions: taxRes.data.catalog_positions ?? [],
        grips: taxRes.data.catalog_grips ?? [],
        variations: taxRes.data.catalog_variations ?? [],
        load_modalities: taxRes.data.catalog_load_modalities ?? [],
        muscles: libRes.data.catalog_muscles ?? [],
      });

      const pairs = new Map<string, PairMuscles>();
      for (const group of taxRes.data.catalog_muscle_groups ?? []) {
        for (const pair of group.group_movement_types ?? []) {
          pairs.set(pairKey(group.code, pair.movement_type.code), {
            target: pair.target_muscle?.code ?? "",
            secondary: (pair.secondary_muscles ?? []).map((s) => s.muscle.code),
            profiles: (pair.target_profiles ?? []).map((p) => ({
              target: p.target_muscle.code,
              secondary: (p.secondary_muscles ?? []).map((s) => s.muscle.code),
            })),
          });
        }
      }
      setPairMuscles(pairs);
      setGroups(taxRes.data.catalog_muscle_groups ?? []);

      if (editExoId) {
        const ex = libRes.data.catalog_exercises.find((row) => row.exo_id === editExoId);
        const extra = (await staffFetch(`/api/catalog/update?exo_id=${editExoId}`)) as {
          data: ExerciseDetail;
        };
        if (ex) {
          setForm({
            ...formFromExercise(ex),
            muscles_custom_reason: extra.data.muscles_custom_reason ?? "",
          });
        }
        setOriginal(ex ?? null);
        setDetail(extra.data);
        setCopySource(null);
        // Optional: the editor works without them (no poses yet, images not set up).
        const poseRes = (await staffFetch(`/api/images/exercises/${editExoId}/poses`).catch(
          () => null,
        )) as { poses?: PoseRow[] } | null;
        setPoses(poseRes?.poses ?? []);
      } else if (copyFromExoId != null) {
        const ex = libRes.data.catalog_exercises.find((row) => row.exo_id === copyFromExoId);
        if (ex) {
          // A copy keeps the muscles; a custom copy needs its own reason.
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
          position_code: fullPath[3] || "",
          grip_code: fullPath[4] || DEFAULT_GRIP_CODE,
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

    }
    void loadLookups().catch((err) => {
      setMessage(err instanceof Error ? err.message : "Failed to load lookups");
    });
  }, [staffFetch, editExoId, copyFromExoId, createFromSelection]);

  const copyValidation = useMemo(() => {
    if (!isCopy || !copySource) {
      return { warnings: [] as string[], canCreate: true };
    }

    const name = form.localizations.en.display_name.trim();
    const nameKey = name.toLowerCase();
    const warnings: string[] = [];

    const sourceNameKey = copySource.display_name.trim().toLowerCase();
    if (nameKey && nameKey === sourceNameKey) {
      warnings.push("Display name must differ from the copied exercise");
    }

    const formFp = formCreateFingerprint(form);
    const sourceFp = exerciseFingerprintFromCatalog(copySource);
    if (formFp === sourceFp) {
      warnings.push("Change at least one field from the copied exercise before creating");
    }

    const canCreate =
      name.length > 0 &&
      nameKey !== sourceNameKey &&
      formFp !== sourceFp;

    return { warnings, canCreate };
  }, [isCopy, copySource, form]);

  /** Another active exercise with the same facet tuple (backend 2.10.0); a warning, not a block. */
  const tupleDuplicate = useMemo(
    () => findFacetTupleDuplicate(form, allExercises, editExoId),
    [form, allExercises, editExoId],
  );

  const pair = pairMuscles.get(pairKey(form.primary_muscle_group_code, form.movement_type_code));
  /** The pair's target profile for the current target, if any (an inherited exercise keeps it). */
  const profile = pair?.profiles.find((p) => p.target === form.target_muscle_code) ?? null;
  /** What an inherited exercise resolves to: the profile of its target, else the pair. */
  const pairView: MuscleSet | null = pair?.target ? (profile ?? pair) : null;
  /** The pair's muscles when the exercise inherits them; null when it picks its own. */
  const inheritedFromPair = form.muscles_inherited && pairView ? pairView : null;

  const group = groups.find((g) => g.code === form.primary_muscle_group_code);
  /** The group's own muscles (home = role target): the only valid targets (backend 2.10.0). */
  const homeCodes = useMemo(
    () => new Set((group?.group_muscles ?? []).filter((m) => m.role === "target").map((m) => m.muscle.code)),
    [group],
  );
  const targetMuscles = useMemo(
    () => lookups.muscles.filter((m) => homeCodes.has(m.code)),
    [lookups.muscles, homeCodes],
  );
  /** Home group of each muscle (its role target row). */
  const homeOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      for (const m of g.group_muscles) if (m.role === "target") map.set(m.muscle.code, g.code);
    }
    return map;
  }, [groups]);

  /** Logging mode: the exercise's own on edit (the form does not change it), inferred on create. */
  const loggingMode =
    original?.logging_mode?.code ??
    inferLoggingModeCode({
      primary_muscle_group_code: form.primary_muscle_group_code,
      movement_type_code: form.movement_type_code,
    });

  /** Every guard rail the form breaks now; the save waits until the list is empty. */
  const guardErrors = useMemo(() => {
    const errors: string[] = [];
    let cex: number | null = null;
    let pulley = 1;
    try {
      cex = parseBodyMassCoefficient(form.body_mass_coefficient);
    } catch (err) {
      errors.push((err as Error).message);
    }
    try {
      pulley = parsePulleyRatio(form.default_pulley_ratio);
    } catch (err) {
      errors.push((err as Error).message);
    }
    const target = inheritedFromPair ? inheritedFromPair.target : form.target_muscle_code;
    if (form.load_modality_code && form.equipment_code) {
      errors.push(
        ...exerciseGuardRailErrors({
          groupCode: form.primary_muscle_group_code,
          groupKind: group?.kind ?? null,
          equipment: form.equipment_code,
          loadModality: form.load_modality_code,
          loggingMode,
          bodyMassCoefficient: cex,
          pulleyRatio: pulley,
          musclesInherited: form.muscles_inherited,
          musclesCustomReason: form.muscles_custom_reason,
          // A pair's target belongs to its group (the database checks pairs too).
          targetCode: inheritedFromPair ? "" : target,
          targetHomeGroupCode: target ? (homeOf.get(target) ?? null) : null,
        }),
      );
    }
    errors.push(
      ...duplicateNameErrors(
        Object.fromEntries(CATALOG_LOCALES.map((loc) => [loc, form.localizations[loc].display_name])),
        allExercises,
        editExoId,
      ),
    );
    return errors;
  }, [form, inheritedFromPair, group, homeOf, loggingMode, allExercises, editExoId]);

  function setMusclesInherited(inherited: boolean) {
    if (inherited === form.muscles_inherited) return;
    // Going custom starts from the pair's muscles, as the database keeps them.
    const start = !inherited && pairView ? pairView : null;
    setForm({
      ...form,
      muscles_inherited: inherited,
      ...(start
        ? { target_muscle_code: start.target, secondary_muscle_codes: start.secondary }
        : {}),
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (isCopy && !copyValidation.canCreate) {
      setMessage(copyValidation.warnings[0] ?? "Fix validation errors before creating");
      return;
    }
    if (guardErrors.length) {
      setMessage(guardErrors.join("; "));
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        display_name: form.localizations.en.display_name.trim(),
        description: form.localizations.en.description.trim() || null,
        localizations: form.localizations,
      };
      if (inheritedFromPair) {
        // Muscles come from the pair (or its profile for this target): never send secondaries,
        // the database refuses them on an inherited exercise.
        payload.target_muscle_code = inheritedFromPair.target;
        delete payload.secondary_muscle_codes;
      }
      if (form.muscles_inherited) delete payload.muscles_custom_reason;
      else payload.muscles_custom_reason = form.muscles_custom_reason.trim();
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
    loading || (isCopy && !copyValidation.canCreate) || guardErrors.length > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
        <div className="md:col-span-2 space-y-3">
          <div className="flex flex-wrap gap-2">
            {CATALOG_LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocaleTab(loc)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  localeTab === loc
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                {loc.toUpperCase()}
              </button>
            ))}
          </div>
          <Field label={`Display name (${localeTab.toUpperCase()})`}>
            <Input
              ref={localeTab === "en" ? nameInputRef : undefined}
              value={form.localizations[localeTab].display_name}
              onChange={(e) =>
                setForm({
                  ...form,
                  display_name:
                    localeTab === "en" ? e.target.value : form.display_name,
                  localizations: {
                    ...form.localizations,
                    [localeTab]: {
                      ...form.localizations[localeTab],
                      display_name: e.target.value,
                    },
                  },
                })
              }
              required={localeTab === "en"}
            />
          </Field>
          <Field label={`Description (${localeTab.toUpperCase()})`}>
            <textarea
              className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              value={form.localizations[localeTab].description}
              onChange={(e) =>
                setForm({
                  ...form,
                  localizations: {
                    ...form.localizations,
                    [localeTab]: {
                      ...form.localizations[localeTab],
                      description: e.target.value,
                    },
                  },
                })
              }
            />
          </Field>
        </div>
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
          label="Support (optional)"
          value={form.support_equipment_code}
          options={lookups.support_equipment}
          onChange={(value) => setForm({ ...form, support_equipment_code: value })}
          allowEmpty
          emptyLabel="— (none)"
        />
        <LookupSelect
          label="Position"
          required
          value={form.position_code}
          options={lookups.positions}
          onChange={(value) => setForm({ ...form, position_code: value })}
        />
        <GripSelect
          value={form.grip_code}
          options={lookups.grips}
          poses={poses}
          onChange={(value) => setForm({ ...form, grip_code: value })}
        />
        <LookupSelect
          label="Variation"
          value={form.variation_code}
          options={lookups.variations}
          onChange={(value) => setForm({ ...form, variation_code: value })}
        />
        <FacetSelect
          label="Width"
          value={form.width}
          values={WIDTHS}
          onChange={(value) => setForm({ ...form, width: value })}
        />
        <FacetSelect
          label="Inclination"
          value={form.inclination}
          values={INCLINATIONS}
          onChange={(value) => setForm({ ...form, inclination: value })}
        />
        <FacetSelect
          label="Laterality"
          value={form.laterality}
          values={LATERALITIES}
          onChange={(value) => setForm({ ...form, laterality: value })}
        />
        <Field label="App">
          <label className="flex items-center gap-2 py-2 text-sm">
            <input
              type="checkbox"
              checked={form.app_visible}
              onChange={(e) => setForm({ ...form, app_visible: e.target.checked })}
            />
            Listed in the app
          </label>
          <span className="block text-xs text-zinc-500">
            Off only for an entry that is not an exercise (Resting): the app does not list it, the
            Lab and the set history still see it.
          </span>
        </Field>
        <LookupSelect
          label="Load modality"
          required
          value={form.load_modality_code}
          options={lookups.load_modalities}
          onChange={(value) => setForm({ ...form, load_modality_code: value })}
        />
        <Field label="C_ex (body mass coefficient)">
          <Input
            type="number"
            step="0.01"
            min="0"
            max="1"
            placeholder="empty: the body is not part of the load"
            value={form.body_mass_coefficient}
            onChange={(e) => setForm({ ...form, body_mass_coefficient: e.target.value })}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Empty, or greater than 0 and at most 1. Needed for BODYWEIGHT / ASSISTED logged as LOAD;
            empty on TIME. Logging mode: {loggingMode}.
          </span>
        </Field>
        <Field label="Pulley ratio">
          <Input
            type="number"
            step="0.5"
            min="0"
            value={form.default_pulley_ratio}
            onChange={(e) => setForm({ ...form, default_pulley_ratio: e.target.value })}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            1 = the user logs the stack number. Another value only on CABLE.
          </span>
        </Field>
        <div className="space-y-3 md:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Muscles</span>
            <div className="flex gap-1">
              {([true, false] as const).map((inherited) => (
                <button
                  key={String(inherited)}
                  type="button"
                  onClick={() => setMusclesInherited(inherited)}
                  className={`rounded-md px-3 py-1 text-sm ${
                    form.muscles_inherited === inherited
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  {inherited ? "Inherited" : "Custom"}
                </button>
              ))}
            </div>
          </div>
          {inheritedFromPair ? (
            <div className="space-y-1">
              <MuscleSetChips muscles={lookups.muscles} value={inheritedFromPair} />
              <p className="text-xs text-zinc-500">
                {profile
                  ? `From the target profile ${profile.target} of the pair ${form.primary_muscle_group_code} + ${form.movement_type_code} (changed by a backend migration).`
                  : `From the pair ${form.primary_muscle_group_code} + ${form.movement_type_code}. Edit them in Taxonomy → Group movements.`}
              </p>
            </div>
          ) : (
            <>
              {form.muscles_inherited && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  This pair has no muscles yet; it will take these.
                </p>
              )}
              {!form.muscles_inherited && (
                <Field label="Why custom muscles (required)">
                  <textarea
                    className="min-h-16 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="The biomechanical reason this exercise does not use its pair's muscles"
                    value={form.muscles_custom_reason}
                    required
                    onChange={(e) => setForm({ ...form, muscles_custom_reason: e.target.value })}
                  />
                </Field>
              )}
              <MuscleSetEditor
                muscles={lookups.muscles}
                targetMuscles={targetMuscles}
                targetHint={`Targets: the muscles of ${form.primary_muscle_group_code} (Taxonomy → Anatomy).`}
                value={{ target: form.target_muscle_code, secondary: form.secondary_muscle_codes }}
                onChange={(value) =>
                  setForm({
                    ...form,
                    target_muscle_code: value.target,
                    secondary_muscle_codes: value.secondary,
                  })
                }
              />
            </>
          )}
        </div>
      </Card>
      {tupleDuplicate && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Same facets as #{tupleDuplicate.exo_id} {tupleDuplicate.display_name} (group, movement,
          equipment, support, grip, position, variation, width, inclination and laterality are
          unique among active exercises). Change one of them, or keep it only if the backend
          whitelists this pair.
        </p>
      )}
      {guardErrors.length > 0 && (
        <ul className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {guardErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
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
      {detail && detail.history.length > 0 && <ExerciseHistory entries={detail.history} />}
    </form>
  );
}

function formFromExercise(ex: CatalogExerciseRow): ExerciseFormState {
  const localizations = emptyLocaleFields();
  for (const loc of ex.localizations ?? []) {
    const key = loc.locale as CatalogLocale;
    if (key in localizations) {
      localizations[key] = {
        display_name: loc.display_name ?? "",
        description: loc.description ?? "",
      };
    }
  }
  if (!localizations.en.display_name) {
    localizations.en.display_name = ex.display_name;
  }
  return {
    display_name: localizations.en.display_name || ex.display_name,
    primary_muscle_group_code: ex.primary_muscle_group?.code ?? "CHEST",
    movement_type_code: ex.movement_type?.code ?? "PRESS",
    equipment_code: ex.equipment?.code ?? "BARBELL",
    support_equipment_code: ex.support_equipment?.code ?? "",
    position_code: ex.position?.code ?? "",
    grip_code: ex.grip?.code ?? DEFAULT_GRIP_CODE,
    variation_code: ex.variation?.code ?? "STANDARD",
    load_modality_code: ex.load_modality?.code ?? "",
    width: oneOf(WIDTHS, ex.width, FACET_DEFAULTS.width),
    inclination: oneOf(INCLINATIONS, ex.inclination, FACET_DEFAULTS.inclination),
    laterality: oneOf(LATERALITIES, ex.laterality, FACET_DEFAULTS.laterality),
    app_visible: ex.app_visible ?? FACET_DEFAULTS.app_visible,
    body_mass_coefficient: ex.body_mass_coefficient == null ? "" : String(ex.body_mass_coefficient),
    default_pulley_ratio: String(ex.default_pulley_ratio ?? 1),
    muscles_custom_reason: "",
    ...musclesFromExercise(ex),
    taxonomy_status: ex.taxonomy_status,
    localizations,
  };
}

/** `value` when it is one of `list`, else `fallback`. */
function oneOf<T extends string>(list: readonly T[], value: string | null | undefined, fallback: T): T {
  return (list as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

/** The exercise's resolved muscles (its pair's when inherited) and its mode. */
function musclesFromExercise(ex: CatalogExerciseRow) {
  const resolved = ex.resolved_muscles ?? [];
  return {
    target_muscle_code:
      resolved.find((m) => m.role === "target")?.muscle.code ?? ex.target_muscle?.code ?? "",
    secondary_muscle_codes: resolved
      .filter((m) => m.role === "secondary")
      .map((m) => m.muscle.code),
    muscles_inherited: ex.muscles_inherited ?? false,
  };
}

const formatValue = (value: unknown) =>
  value === null || value === undefined ? "∅" : typeof value === "object" ? JSON.stringify(value) : String(value);

/** The exercise's change history (catalog.change_log), newest first. */
function ExerciseHistory({ entries }: { entries: HistoryEntry[] }) {
  return (
    <details className="rounded-md border border-zinc-200 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">History ({entries.length})</summary>
      <ol className="mt-2 space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="text-xs text-zinc-600">
            <span className="font-mono">{new Date(entry.changed_at).toLocaleString()}</span>{" "}
            {entry.op.toLowerCase()} {entry.what}
            {entry.actor && <span className="text-zinc-400"> · {entry.actor}</span>}
            {entry.changes.length > 0 && (
              <ul className="ml-4 list-disc">
                {entry.changes.map((c) => (
                  <li key={c.field}>
                    <span className="font-mono">{c.field}</span>: {formatValue(c.from)} → {formatValue(c.to)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
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
  emptyLabel,
  required,
}: {
  label: string;
  value: string;
  options: LookupRow[];
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** Mandatory, no default: the empty choice is a prompt and the form cannot be sent with it. */
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      >
        {required && <option value="">Select…</option>}
        {allowEmpty && <option value="">{emptyLabel ?? "— (none)"}</option>}
        {selectableOptions(options, value).map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.code} — {opt.name}
            {opt.retired ? " (retired)" : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A facet with a closed CHECK list (width, inclination, laterality), with what each value means. */
function FacetSelect<T extends string>({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: T;
  values: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <select
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {values.map((code) => (
          <option key={code} value={code}>
            {code} — {FACET_HINTS[code as keyof typeof FACET_HINTS] ?? code}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * The orientation of the hand, named in every catalog language. A grip left STANDARD (not
 * classified) gets a notice with what the exercise's poses say about the hands.
 */
function GripSelect({
  value,
  options,
  poses,
  onChange,
}: {
  value: string;
  options: LookupRow[];
  poses: PoseRow[];
  onChange: (value: string) => void;
}) {
  const current = options.find((opt) => opt.code === value);
  const unclassified = value === UNCLASSIFIED_GRIP_CODE;
  const evidence = unclassified
    ? poses.map((p) => ({ position: p.position, lines: gripEvidence(p.pose) }))
    : [];
  return (
    <Field label="Grip (orientation of the hand)">
      <select
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {selectableOptions(options, value).map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.code} — {resolveLocalizedName(opt, "en")}
            {opt.code === UNCLASSIFIED_GRIP_CODE ? " (not classified)" : ""}
            {opt.retired ? " (retired)" : ""}
          </option>
        ))}
      </select>
      {current && (
        <span className="mt-1 block text-xs text-zinc-500">
          {CATALOG_LOCALES.map((loc) => `${loc.toUpperCase()}: ${resolveLocalizedName(current, loc)}`).join(
            " · ",
          )}
          {" · NONE when no grip applies; the width of the hands is Width"}
        </span>
      )}
      {unclassified && (
        <span className="mt-2 block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          STANDARD means the orientation is not settled yet. Pick Pronated, Supinated, Neutral,
          Rotating or No grip from the how-to and the poses.
          {evidence.length === 0 && " This exercise has no pose texts."}
          {evidence.map((p) => (
            <span key={p.position} className="mt-1 block">
              <span className="font-medium">Pose {p.position}:</span>{" "}
              {p.lines.length ? p.lines.join(" ") : "says nothing about the hands."}
            </span>
          ))}
        </span>
      )}
    </Field>
  );
}
