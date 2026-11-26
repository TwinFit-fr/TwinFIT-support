"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import {
  groupSearchSynonyms,
  normalizeSearchPhrase,
  SEARCH_SYNONYM_KIND_INFO,
  SEARCH_SYNONYM_KINDS,
  SEARCH_SYNONYM_LOCALES,
  synonymGroupKey,
  synonymGroupMatches,
  type SearchSynonymEntry,
  type SearchSynonymGroup,
  type SearchSynonymKind,
  type SearchSynonymLocale,
  type SearchSynonymOption,
  type SearchSynonymRow,
  type SearchSynonymsData,
} from "@/lib/catalog/search-synonyms";

const SELECT = "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm";
const PAGE = 150;

type AddInput = { locale: SearchSynonymLocale; phrase: string; kind: SearchSynonymKind; codes: string[] };

/** "#41 Seated Leg Curl" for an alias, "Quadriceps (QUADS)" for a filter; flags inactive / unknown codes. */
function useLabels(options: SearchSynonymsData["options"]) {
  return useMemo(() => {
    const maps = Object.fromEntries(
      Object.entries(options).map(([source, list]) => [
        source,
        new Map((list as SearchSynonymOption[]).map((o) => [o.code, o])),
      ]),
    ) as Record<keyof SearchSynonymsData["options"], Map<string, SearchSynonymOption>>;
    const optionOf = (entry: SearchSynonymEntry) => {
      const info = SEARCH_SYNONYM_KIND_INFO[entry.kind as SearchSynonymKind];
      return info ? maps[info.source].get(entry.code) : undefined;
    };
    const labelOf = (entry: SearchSynonymEntry) => {
      const option = optionOf(entry);
      if (entry.kind === "exercise") return `#${entry.code} ${option?.name ?? ""}`.trim();
      return option?.name && option.name !== entry.code ? `${option.name} (${entry.code})` : entry.code;
    };
    return { optionOf, labelOf };
  }, [options]);
}

/**
 * Catalog search synonyms per locale: the phrases people type for a filter or an exercise. A
 * phrase may stand for several codes (backend 2.12.0); each (phrase, kind, code) is one row, added
 * or deleted on its own.
 */
export function SearchSynonymsEditor({
  data,
  onAdd,
  onDelete,
}: {
  data: SearchSynonymsData;
  onAdd: (input: AddInput) => Promise<boolean>;
  onDelete: (row: SearchSynonymRow) => Promise<void>;
}) {
  const { optionOf, labelOf } = useLabels(data.options);
  const groups = useMemo(() => groupSearchSynonyms(data.synonyms), [data.synonyms]);
  const byKey = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);

  // Add form
  const formRef = useRef<HTMLDivElement>(null);
  const [locale, setLocale] = useState<SearchSynonymLocale>("en");
  const [phrase, setPhrase] = useState("");
  const [kind, setKind] = useState<SearchSynonymKind>("exercise");
  const [codeFilter, setCodeFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const normalized = normalizeSearchPhrase(phrase);
  const sameGroup = normalized ? byKey.get(synonymGroupKey(locale, normalized)) : undefined;
  const alreadyCodes = new Set(
    (sameGroup?.entries ?? []).filter((e) => e.kind === kind).map((e) => e.code),
  );
  const kindInfo = SEARCH_SYNONYM_KIND_INFO[kind];
  const kindOptions = data.options[kindInfo.source].filter((o) => o.active);
  const codeQuery = normalizeSearchPhrase(codeFilter);
  const shownOptions = kindOptions.filter(
    (o) =>
      picked.has(o.code) ||
      !codeQuery ||
      normalizeSearchPhrase(o.code).includes(codeQuery) ||
      normalizeSearchPhrase(o.name).includes(codeQuery),
  );
  const toAdd = [...picked].filter((c) => !alreadyCodes.has(c));

  function togglePick(code: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function changeKind(next: SearchSynonymKind) {
    setKind(next);
    setPicked(new Set());
    setCodeFilter("");
  }

  async function submit() {
    if (!normalized || !toAdd.length) return;
    setAdding(true);
    try {
      if (await onAdd({ locale, phrase: normalized, kind, codes: toAdd })) {
        setPicked(new Set());
        setCodeFilter("");
      }
    } finally {
      setAdding(false);
    }
  }

  /** Fills the form with a listed phrase, to add another code to it. */
  function addToGroup(group: SearchSynonymGroup) {
    if ((SEARCH_SYNONYM_LOCALES as readonly string[]).includes(group.locale)) {
      setLocale(group.locale as SearchSynonymLocale);
    }
    setPhrase(group.phrase);
    const firstKind = group.entries[0]?.kind;
    if (firstKind && (SEARCH_SYNONYM_KINDS as readonly string[]).includes(firstKind)) {
      changeKind(firstKind as SearchSynonymKind);
    }
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // List
  const [localeFilter, setLocaleFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const visible = groups.filter(
    (g) =>
      (localeFilter === "all" || g.locale === localeFilter) &&
      (kindFilter === "all" || g.entries.some((e) => e.kind === kindFilter)) &&
      synonymGroupMatches(g, query, labelOf),
  );
  const rowCount = visible.reduce((n, g) => n + g.entries.length, 0);

  async function remove(group: SearchSynonymGroup, entry: SearchSynonymEntry) {
    const row = { locale: group.locale, phrase: group.phrase, kind: entry.kind, code: entry.code };
    const key = `${group.key}\u0000${entry.kind}\u0000${entry.code}`;
    setDeleting((prev) => new Set(prev).add(key));
    try {
      await onDelete(row);
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <div ref={formRef}>
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900">Add a phrase</h2>
          <div className="grid gap-3 md:grid-cols-[auto_1fr_auto]">
            <label className="space-y-1 text-sm">
              <span className="block font-medium text-zinc-700">Locale</span>
              <select
                className={SELECT}
                value={locale}
                onChange={(e) => setLocale(e.target.value as SearchSynonymLocale)}
              >
                {SEARCH_SYNONYM_LOCALES.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium text-zinc-700">Phrase</span>
              <Input
                value={phrase}
                maxLength={120}
                placeholder="e.g. leg curl, curl de piernas, lower traps"
                onChange={(e) => setPhrase(e.target.value)}
              />
              <span className="block text-xs text-zinc-500">
                {normalized ? (
                  <>
                    Stored as <code className="rounded bg-zinc-100 px-1">{normalized}</code> (lower
                    case, no accents, like the search)
                  </>
                ) : (
                  "Lower case, accents and punctuation are folded like the search."
                )}
              </span>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium text-zinc-700">Stands for</span>
              <select
                className={SELECT}
                value={kind}
                onChange={(e) => changeKind(e.target.value as SearchSynonymKind)}
              >
                {SEARCH_SYNONYM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {SEARCH_SYNONYM_KIND_INFO[k].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-zinc-500">{kindInfo.hint}</p>

          {sameGroup && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-medium">
                &ldquo;{sameGroup.phrase}&rdquo; ({sameGroup.locale.toUpperCase()}) already stands for:
              </span>{" "}
              {sameGroup.entries
                .map((e) => `${SEARCH_SYNONYM_KIND_INFO[e.kind as SearchSynonymKind]?.label ?? e.kind}: ${labelOf(e)}`)
                .join(" · ")}
              . New codes are added next to these.
            </div>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="max-w-xs"
                value={codeFilter}
                placeholder={kind === "exercise" ? "Filter by name or exo_id" : "Filter by name or code"}
                onChange={(e) => setCodeFilter(e.target.value)}
              />
              <span className="text-xs text-zinc-500">
                {picked.size ? `${picked.size} picked` : "Pick one or more"} · {shownOptions.length} of{" "}
                {kindOptions.length} active
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-zinc-200">
              {shownOptions.length === 0 ? (
                <p className="px-3 py-2 text-sm text-zinc-500">No match.</p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {shownOptions.map((o) => {
                    const already = alreadyCodes.has(o.code);
                    return (
                      <li key={o.code}>
                        <label
                          className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
                            already ? "text-zinc-400" : "cursor-pointer hover:bg-zinc-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={already}
                            checked={already || picked.has(o.code)}
                            onChange={() => togglePick(o.code)}
                          />
                          <span className="font-mono text-xs text-zinc-500">
                            {kind === "exercise" ? `#${o.code}` : o.code}
                          </span>
                          <span>{o.name}</span>
                          {already && <span className="text-xs">(already)</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" disabled={adding || !normalized || !toAdd.length} onClick={submit}>
              <Plus className="h-4 w-4" />
              {adding ? "Adding…" : toAdd.length > 1 ? `Add ${toAdd.length} rows` : "Add"}
            </Button>
            {normalized && toAdd.length > 0 && (
              <span className="text-xs text-zinc-500">
                &ldquo;{normalized}&rdquo; → {toAdd.map((code) => labelOf({ kind, code })).join(", ")}
              </span>
            )}
          </div>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={SELECT}
            value={localeFilter}
            aria-label="Locale"
            onChange={(e) => {
              setLocaleFilter(e.target.value);
              setLimit(PAGE);
            }}
          >
            <option value="all">All locales</option>
            {SEARCH_SYNONYM_LOCALES.map((loc) => (
              <option key={loc} value={loc}>
                {loc.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            className={SELECT}
            value={kindFilter}
            aria-label="Kind"
            onChange={(e) => {
              setKindFilter(e.target.value);
              setLimit(PAGE);
            }}
          >
            <option value="all">All kinds</option>
            {SEARCH_SYNONYM_KINDS.map((k) => (
              <option key={k} value={k}>
                {SEARCH_SYNONYM_KIND_INFO[k].label}
              </option>
            ))}
          </select>
          <Input
            className="max-w-xs"
            value={query}
            placeholder="Search phrase, code or name"
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
          <span className="text-xs text-zinc-500">
            {visible.length} phrases · {rowCount} rows
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3 font-medium">Locale</th>
                <th className="py-2 pr-3 font-medium">Phrase</th>
                <th className="py-2 pr-3 font-medium">Stands for</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, limit).map((group) => (
                <tr key={group.key} className="border-b border-zinc-100 align-top">
                  <td className="py-2 pr-3">
                    <Badge>{group.locale.toUpperCase()}</Badge>
                  </td>
                  <td className="py-2 pr-3 font-medium text-zinc-900">{group.phrase}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1.5">
                      {group.entries.map((entry) => {
                        const option = optionOf(entry);
                        const key = `${group.key}\u0000${entry.kind}\u0000${entry.code}`;
                        const kindLabel =
                          SEARCH_SYNONYM_KIND_INFO[entry.kind as SearchSynonymKind]?.label ?? entry.kind;
                        return (
                          <span
                            key={key}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                              option && option.active
                                ? "border-zinc-200 bg-zinc-50 text-zinc-800"
                                : "border-amber-300 bg-amber-50 text-amber-900"
                            }`}
                          >
                            <span className="text-zinc-500">{kindLabel}:</span>
                            <span>{labelOf(entry)}</span>
                            {!option && <span>(unknown)</span>}
                            {option && !option.active && <span>(inactive)</span>}
                            <button
                              type="button"
                              className="ml-0.5 rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-50"
                              aria-label={`Delete "${group.phrase}" → ${labelOf(entry)}`}
                              title="Delete this row"
                              disabled={deleting.has(key)}
                              onClick={() => remove(group, entry)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => addToGroup(group)}>
                      <Plus className="h-3 w-3" /> Code
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length > limit && (
          <Button type="button" variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>
            Show more ({visible.length - limit} left)
          </Button>
        )}
        {visible.length === 0 && <p className="text-sm text-zinc-500">No phrase matches.</p>}
      </Card>
    </div>
  );
}
