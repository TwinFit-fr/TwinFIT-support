"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import {
  Search,
  User,
  ArrowRight,
  ShieldCheck,
  Ban,
  MailCheck,
  Calendar,
} from "lucide-react";
import { Badge, Button, Card, Input, Skeleton } from "@/components/ui/primitives";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import type { SupportUserLookup } from "@/lib/support/types";

function SupportSearchContent() {
  const staffFetch = useStaffFetch();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SupportUserLookup | null>(null);

  const executeSearch = useCallback(
    async (searchTerm: string) => {
      const q = searchTerm.trim();
      if (!q) return;
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const data = (await staffFetch(
          `/api/support/lookup?q=${encodeURIComponent(q)}`,
        )) as SupportUserLookup;
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [staffFetch],
  );

  useEffect(() => {
    if (initialQuery) {
      void executeSearch(initialQuery);
    }
  }, [initialQuery, executeSearch]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void executeSearch(query);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">User Support</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Lookup accounts by email, @username, or User UUID.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="user@example.com, @username, or user-uuid..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              required
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </Button>
        </form>
        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
            {error}
          </p>
        )}
      </Card>

      {loading && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </Card>
      )}

      {result?.user && !loading && (
        <Card className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-full bg-zinc-900 text-white flex items-center justify-center text-lg font-bold">
                {result.user.email.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-zinc-900">{result.user.email}</h2>
                  <Badge className="bg-zinc-900 text-white">
                    {result.profile?.subscription_tier ?? "free"}
                  </Badge>
                  {result.user.emailVerified ? (
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <MailCheck className="h-3 w-3" /> Verified
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-50 text-amber-700 border border-amber-200">
                      Unverified
                    </Badge>
                  )}
                  {result.user.disabled && (
                    <Badge className="bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
                      <Ban className="h-3 w-3" /> Disabled
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-zinc-500 font-mono">
                  ID: {result.user.id}
                </p>
              </div>
            </div>

            <Link href={`/support/${result.user.id}`}>
              <Button>
                View Full Profile <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 pt-3 border-t border-zinc-100 text-sm">
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-100">
              <p className="text-xs text-zinc-500 font-medium uppercase">Username</p>
              <p className="mt-1 font-semibold text-zinc-800">
                @{result.profile?.username ?? "—"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-100">
              <p className="text-xs text-zinc-500 font-medium uppercase">Workout Sessions</p>
              <p className="mt-1 font-semibold text-zinc-800">
                {result.finishedSessions} completed
              </p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-100">
              <p className="text-xs text-zinc-500 font-medium uppercase">Templates</p>
              <p className="mt-1 font-semibold text-zinc-800">
                {result.templateCount} custom templates
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function SupportSearchPage() {
  return (
    <Suspense fallback={<Card className="p-6"><Skeleton className="h-10 w-full" /></Card>}>
      <SupportSearchContent />
    </Suspense>
  );
}
