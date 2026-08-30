"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import type { SupportUserLookup } from "@/lib/support/types";

export default function SupportSearchPage() {
  const staffFetch = useStaffFetch();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SupportUserLookup | null>(null);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = (await staffFetch(
        `/api/support/lookup?q=${encodeURIComponent(query)}`,
      )) as SupportUserLookup;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">User support</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Search by email or @username.
        </p>
      </div>

      <Card>
        <form onSubmit={onSearch} className="flex flex-col gap-3 md:flex-row">
          <Input
            placeholder="user@example.com or @handle"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>

      {result?.user && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium">{result.user.email}</h2>
            <Badge>{result.profile?.subscription_tier ?? "unknown"}</Badge>
            {!result.user.emailVerified && <Badge className="bg-amber-100">Unverified</Badge>}
            {result.user.disabled && <Badge className="bg-red-100 text-red-700">Disabled</Badge>}
          </div>
          <p className="text-sm text-zinc-600">
            @{result.profile?.username ?? "—"} · {result.finishedSessions} finished sessions ·{" "}
            {result.templateCount} templates
          </p>
          <Link
            href={`/support/${result.user.id}`}
            className="inline-block text-sm font-medium underline"
          >
            Open user detail
          </Link>
        </Card>
      )}
    </div>
  );
}
