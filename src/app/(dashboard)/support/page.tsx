"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { Search, ArrowRight, Ban, MailCheck } from "lucide-react";
import { RoleBadges } from "@/components/support/role-badges";
import { Badge, Button, Card, Input, Skeleton } from "@/components/ui/primitives";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import type { SupportUserSearchHit } from "@/lib/support/types";

const MIN_CHARS = 4;

function SearchResultRow({ hit }: { hit: SupportUserSearchHit }) {
  const label = hit.display_name || hit.username || hit.email;

  return (
    <Link
      href={`/support/${hit.id}`}
      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-zinc-900">{label}</p>
          <Badge className="bg-zinc-900 text-white capitalize">{hit.subscription_tier}</Badge>
          {hit.emailVerified ? (
            <Badge className="flex items-center gap-1 border border-emerald-200 bg-emerald-50 text-emerald-700">
              <MailCheck className="h-3 w-3" /> Verified
            </Badge>
          ) : (
            <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
              Unverified
            </Badge>
          )}
          {hit.disabled && (
            <Badge className="flex items-center gap-1 border border-red-200 bg-red-50 text-red-700">
              <Ban className="h-3 w-3" /> Disabled
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500">
          {hit.email}
          {hit.username ? ` · @${hit.username}` : ""}
        </p>
        <RoleBadges
          defaultRole={hit.defaultRole}
          roles={hit.roles}
          className="mt-2"
        />
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
    </Link>
  );
}

function SupportSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery.trim());
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const typeaheadTerm = debouncedQuery.length >= MIN_CHARS ? debouncedQuery : null;

  const {
    data: searchData,
    error: searchError,
    isValidating: searching,
  } = useStaffSWR<{ results: SupportUserSearchHit[] }>(
    typeaheadTerm ? `/api/support/search?q=${encodeURIComponent(typeaheadTerm)}` : null,
    {
      shouldRetryOnError: false,
      keepPreviousData: false,
      dedupingInterval: 300,
    },
  );

  const suggestions = searchData?.results ?? [];
  const searchErrorMessage = searchError
    ? searchError.message || "Search failed"
    : null;

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const next = query.trim();
    if (!next) return;

    if (suggestions.length === 1) {
      router.push(`/support/${suggestions[0].id}`);
      return;
    }

    if (suggestions.length > 0) {
      setDropdownOpen(true);
      return;
    }

    // Fall back: treat as exact id / email / username open
    if (next.length >= MIN_CHARS) {
      setDropdownOpen(true);
    }
  }

  const showDropdown = dropdownOpen && Boolean(typeaheadTerm);
  const showHint = query.trim().length > 0 && query.trim().length < MIN_CHARS;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">User Support</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Type at least {MIN_CHARS} characters — suggestions appear as you type (email, username, or display name).
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row">
          <div ref={containerRef} className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="e.g. jsr90, @username, or email…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              className="pl-9"
              autoComplete="off"
            />

            {showHint && (
              <p className="mt-2 text-xs text-zinc-500">
                Keep typing… suggestions start at {MIN_CHARS} characters.
              </p>
            )}

            {showDropdown && (
              <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                {searching && (
                  <div className="px-3 py-3 text-xs text-zinc-500">Searching…</div>
                )}
                {!searching && searchErrorMessage && (
                  <div className="px-3 py-3 text-xs text-red-600">{searchErrorMessage}</div>
                )}
                {!searching && !searchErrorMessage && suggestions.length === 0 && (
                  <div className="px-3 py-3 text-xs text-zinc-500">
                    No users match &quot;{typeaheadTerm}&quot;.
                  </div>
                )}
                {!searching && suggestions.length > 0 && (
                  <div className="divide-y divide-zinc-100 p-1">
                    {suggestions.map((hit) => (
                      <SearchResultRow key={hit.id} hit={hit} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <Button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>
      </Card>
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
