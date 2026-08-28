"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { useAdminFetch } from "@/hooks/use-admin-fetch";

type MuscleGroup = {
  id: string;
  code: string;
  name: string;
  group_muscles: Array<{ role: string; muscle: { code: string; name: string } }>;
  group_movement_types: Array<{ movement_type: { code: string; name: string } }>;
};

export default function CatalogTaxonomyPage() {
  const adminFetch = useAdminFetch();
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [table, setTable] = useState("catalog_muscles");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = (await adminFetch("/api/catalog/taxonomy")) as {
      data: { catalog_muscle_groups: MuscleGroup[] };
    };
    setGroups(res.data.catalog_muscle_groups ?? []);
  }, [adminFetch]);

  useEffect(() => {
    void load().catch((err) => {
      setMessage(err instanceof Error ? err.message : "Failed to load taxonomy");
    });
  }, [load]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await adminFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({ table, code, name }),
      });
      setMessage("Lookup saved.");
      setCode("");
      setName("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Taxonomy</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage lookup tables and inspect muscle group relations.
        </p>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-4">
          <select
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            value={table}
            onChange={(e) => setTable(e.target.value)}
          >
            <option value="catalog_muscles">catalog_muscles</option>
            <option value="catalog_muscle_groups">catalog_muscle_groups</option>
            <option value="catalog_movement_types">catalog_movement_types</option>
            <option value="catalog_equipment">catalog_equipment</option>
            <option value="catalog_variations">catalog_variations</option>
            <option value="catalog_positions">catalog_positions</option>
            <option value="catalog_grips">catalog_grips</option>
          </select>
          <Input placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value)} required />
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Button type="submit">Upsert lookup</Button>
        </form>
        {message && <p className="mt-3 text-sm text-zinc-700">{message}</p>}
      </Card>

      <div className="space-y-4">
        {groups.map((group) => (
          <Card key={group.id}>
            <h2 className="font-medium">
              {group.code} — {group.name}
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Muscles:{" "}
              {group.group_muscles
                .map((row) => `${row.muscle.code} (${row.role})`)
                .join(", ") || "—"}
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              Movements:{" "}
              {group.group_movement_types
                .map((row) => row.movement_type.code)
                .join(", ") || "—"}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
