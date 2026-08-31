"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useIsAdmin } from "@/hooks/use-is-staff";
import { useStaffFetch } from "@/hooks/use-staff-fetch";

type LookupRow = { code: string; name: string };

function ComposeForm() {
  const staffFetch = useStaffFetch();
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editExoId = searchParams.get("exo_id");

  const [lookups, setLookups] = useState<{
    muscle_groups: LookupRow[];
    movement_types: LookupRow[];
    equipment: LookupRow[];
    muscles: LookupRow[];
  }>({ muscle_groups: [], movement_types: [], equipment: [], muscles: [] });

  const [form, setForm] = useState({
    display_name: "",
    primary_muscle_group_code: "CHEST",
    movement_type_code: "PRESS",
    equipment_code: "BARBELL",
    position_code: "NEUTRAL",
    grip_code: "STANDARD",
    variation_code: "STANDARD",
    target_muscle_code: "",
    taxonomy_status: "migrated",
    description: "",
  });

  const [loading, setLoading] = useState(false);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);

  useEffect(() => {
    async function loadLookups() {
      const res = (await staffFetch("/api/catalog/library")) as {
        data: {
          catalog_muscle_groups: LookupRow[];
          catalog_movement_types: LookupRow[];
          catalog_equipment: LookupRow[];
          catalog_muscles: LookupRow[];
          catalog_exercises: Array<{
            exo_id: number;
            display_name: string;
            taxonomy_status: string;
            primary_muscle_group?: { code: string };
            movement_type?: { code: string };
            equipment?: { code: string };
            position?: { code: string };
            grip?: { code: string };
            variation?: { code: string };
            target_muscle?: { code: string };
            localizations?: Array<{ description?: string | null }>;
          }>;
        };
      };
      setLookups({
        muscle_groups: res.data.catalog_muscle_groups ?? [],
        movement_types: res.data.catalog_movement_types ?? [],
        equipment: res.data.catalog_equipment ?? [],
        muscles: res.data.catalog_muscles ?? [],
      });
      if (editExoId) {
        const ex = res.data.catalog_exercises.find(
          (row) => String(row.exo_id) === editExoId,
        );
        if (ex) {
          setForm({
            display_name: ex.display_name,
            primary_muscle_group_code: ex.primary_muscle_group?.code ?? "CHEST",
            movement_type_code: ex.movement_type?.code ?? "PRESS",
            equipment_code: ex.equipment?.code ?? "BARBELL",
            position_code: ex.position?.code ?? "NEUTRAL",
            grip_code: ex.grip?.code ?? "STANDARD",
            variation_code: ex.variation?.code ?? "STANDARD",
            target_muscle_code: ex.target_muscle?.code ?? "",
            taxonomy_status: ex.taxonomy_status,
            description: ex.localizations?.[0]?.description ?? "",
          });
        }
      }
    }
    void loadLookups().catch((err) => {
      toast.error(err instanceof Error ? err.message : "Failed to load lookups");
    });
  }, [staffFetch, editExoId, toast]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        secondary_muscle_codes: [],
      };
      if (editExoId) {
        await staffFetch("/api/catalog/update", {
          method: "POST",
          body: JSON.stringify({ ...payload, exo_id: Number(editExoId) }),
        });
        toast.success(`Exercise "${form.display_name}" updated.`);
      } else {
        await staffFetch("/api/catalog/library", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success(`Exercise "${form.display_name}" created.`);
        router.push("/catalog");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate() {
    if (!editExoId) return;
    setLoading(true);
    try {
      await staffFetch("/api/catalog/deactivate", {
        method: "POST",
        body: JSON.stringify({ exo_id: Number(editExoId) }),
      });
      toast.success("Exercise deactivated.");
      setConfirmDeactivateOpen(false);
      router.push("/catalog");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ConfirmDialog
        open={confirmDeactivateOpen}
        title="Deactivate exercise?"
        description={`Are you sure you want to deactivate exercise ${editExoId} (${form.display_name})?`}
        variant="danger"
        loading={loading}
        confirmLabel="Deactivate"
        onConfirm={() => void handleDeactivate()}
        onCancel={() => setConfirmDeactivateOpen(false)}
      />

      <form onSubmit={onSubmit} className="space-y-6">
        <Card className="grid gap-4 md:grid-cols-2 p-6">
          <Field label="Display name">
            <Input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="e.g. Barbell Incline Bench Press"
              required
            />
          </Field>
          <Field label="Taxonomy status">
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
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
            label="Target muscle"
            value={form.target_muscle_code}
            options={lookups.muscles}
            onChange={(value) => setForm({ ...form, target_muscle_code: value })}
          />
          <Field label="Description (English)" className="md:col-span-2">
            <textarea
              className="min-h-24 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-400"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detailed instructions or exercise execution notes..."
            />
          </Field>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={loading}>
            <Save className="h-4 w-4" />
            {loading ? "Saving…" : editExoId ? "Update exercise" : "Create exercise"}
          </Button>

          {editExoId && form.taxonomy_status === "pending" && isAdmin && (
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmDeactivateOpen(true)}
              disabled={loading}
            >
              <Trash2 className="h-4 w-4" /> Deactivate
            </Button>
          )}

          <Link href="/catalog">
            <Button type="button" variant="secondary">
              <ArrowLeft className="h-4 w-4" /> Back to catalog
            </Button>
          </Link>
        </div>
      </form>
    </>
  );
}

export default function CatalogComposePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Compose Exercise</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create or edit a system catalog exercise with taxonomy bindings.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading form…</p>}>
        <ComposeForm />
      </Suspense>
    </div>
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
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-600">
        {label}
      </span>
      {children}
    </label>
  );
}

function LookupSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: LookupRow[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.code} — {opt.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
