"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, Layers, RefreshCw } from "lucide-react";
import { Badge, Button, Card, Input, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch } from "@/hooks/use-staff-fetch";

type MuscleGroup = {
  id: string;
  code: string;
  name: string;
  group_muscles: Array<{ role: string; muscle: { code: string; name: string } }>;
  group_movement_types: Array<{ movement_type: { code: string; name: string } }>;
};

export default function CatalogTaxonomyPage() {
  const staffFetch = useStaffFetch();
  const toast = useToast();

  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [table, setTable] = useState("catalog_muscles");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await staffFetch("/api/catalog/taxonomy")) as {
        data: { catalog_muscle_groups: MuscleGroup[] };
      };
      setGroups(res.data.catalog_muscle_groups ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load taxonomy");
    } finally {
      setLoading(false);
    }
  }, [staffFetch, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await staffFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({ table, code, name }),
      });
      toast.success(`Lookup "${code}" saved in ${table}.`);
      setCode("");
      setName("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.code.toLowerCase().includes(q) ||
        g.name.toLowerCase().includes(q) ||
        g.group_muscles.some((m) => m.muscle.code.toLowerCase().includes(q)) ||
        g.group_movement_types.some((mt) => mt.movement_type.code.toLowerCase().includes(q)),
    );
  }, [groups, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Taxonomy & Relations</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage lookup tables and inspect muscle group relations.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Upsert Lookup Form */}
      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider">
          Add / Update Lookup Code
        </h2>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
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
          <Input
            placeholder="CODE (e.g. DUMBBELL)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Input
            placeholder="Display Name (e.g. Dumbbell)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Button type="submit" disabled={submitting}>
            <Plus className="h-4 w-4" />
            {submitting ? "Saving…" : "Upsert lookup"}
          </Button>
        </form>
      </Card>

      {/* Search Groups */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Filter muscle groups by code, muscle, or movement..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
        <span className="text-xs text-zinc-500 font-medium">
          {filteredGroups.length} of {groups.length} groups
        </span>
      </div>

      {/* Groups Grid */}
      {loading && groups.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </Card>
          <Card className="p-5 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredGroups.map((group) => (
            <Card key={group.id} className="p-5 space-y-3 hover:border-zinc-300 transition-colors">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                <h3 className="font-semibold text-zinc-900 flex items-center gap-2">
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
                    {group.code}
                  </span>
                  {group.name}
                </h3>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                    Target / Secondary Muscles
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.group_muscles.map((row) => (
                      <Badge
                        key={row.muscle.code}
                        className={
                          row.role === "target"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-zinc-100 text-zinc-600"
                        }
                      >
                        {row.muscle.name || row.muscle.code} ({row.role})
                      </Badge>
                    ))}
                    {group.group_muscles.length === 0 && (
                      <span className="text-zinc-400 italic">No mapped muscles</span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-50">
                  <span className="font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                    Associated Movements
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.group_movement_types.map((row) => (
                      <Badge key={row.movement_type.code} className="bg-purple-50 text-purple-700 border border-purple-200">
                        {row.movement_type.name || row.movement_type.code}
                      </Badge>
                    ))}
                    {group.group_movement_types.length === 0 && (
                      <span className="text-zinc-400 italic">No movements mapped</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
