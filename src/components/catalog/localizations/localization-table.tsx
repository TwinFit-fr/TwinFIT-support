"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { CATALOG_LOCALES, type CatalogLocale } from "@/lib/catalog/locales";

/** One translatable row: a lookup entry or a group + movement pair. */
export type LocalizationRowItem = {
  key: string;
  code: string;
  /** Muted line under the code (e.g. the group and movement names of a pair). */
  context?: string;
  inactive?: boolean;
  labels: Record<CatalogLocale, string>;
  /** Shown in an empty field: what the app falls back to. */
  placeholders: Record<CatalogLocale, string>;
};

/**
 * The labels of one taxonomy in every catalog language, one row per entry with a wide field
 * per locale. Rows save one by one or all at once; `requiredLocales` cannot be emptied.
 */
export function LocalizationTable({
  title,
  hint,
  rows,
  requiredLocales,
  onSave,
}: {
  title: string;
  hint: string;
  rows: LocalizationRowItem[];
  requiredLocales: readonly CatalogLocale[];
  onSave: (row: LocalizationRowItem, labels: Record<CatalogLocale, string>) => Promise<void>;
}) {
  const [filter, setFilter] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Record<CatalogLocale, string>>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const draftOf = (row: LocalizationRowItem) => drafts[row.key] ?? row.labels;
  const isDirty = (row: LocalizationRowItem) =>
    CATALOG_LOCALES.some((loc) => draftOf(row)[loc].trim() !== row.labels[loc].trim());
  const isMissing = (row: LocalizationRowItem) => CATALOG_LOCALES.some((loc) => !row.labels[loc]);
  const invalid = (row: LocalizationRowItem) =>
    requiredLocales.some((loc) => !draftOf(row)[loc].trim());

  const q = filter.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (missingOnly && !isMissing(row)) return false;
    if (!q) return true;
    return (
      row.code.toLowerCase().includes(q) ||
      (row.context ?? "").toLowerCase().includes(q) ||
      CATALOG_LOCALES.some((loc) => row.labels[loc].toLowerCase().includes(q))
    );
  });
  const missingCount = rows.filter(isMissing).length;
  const dirtyRows = rows.filter((row) => isDirty(row) && !invalid(row));

  async function save(row: LocalizationRowItem) {
    setSaving((prev) => new Set(prev).add(row.key));
    try {
      await onSave(row, draftOf(row));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(row.key);
        return next;
      });
    }
  }

  async function saveAll() {
    for (const row of dirtyRows) {
      try {
        await save(row);
      } catch {
        // The page reports the failure; the row keeps its draft to retry.
      }
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-sm text-zinc-500">
            {visible.length} / {rows.length} · {missingCount} missing a language · {hint}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(e) => setMissingOnly(e.target.checked)}
            />
            Missing only
          </label>
          <Input
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-[200px]"
          />
          <Button
            type="button"
            disabled={dirtyRows.length === 0 || saving.size > 0}
            onClick={() => void saveAll()}
          >
            {dirtyRows.length > 0 ? `Save ${dirtyRows.length} change(s)` : "Save all"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[56rem]">
          <div className="grid grid-cols-[12rem_repeat(3,minmax(0,1fr))_5rem] gap-2 border-b border-zinc-200 px-1 pb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <span>Code</span>
            {CATALOG_LOCALES.map((loc) => (
              <span key={loc}>
                {loc}
                {requiredLocales.includes(loc) && " *"}
              </span>
            ))}
            <span />
          </div>
          {visible.length === 0 ? (
            <p className="px-1 py-6 text-sm text-zinc-500">Nothing to show.</p>
          ) : (
            visible.map((row) => {
              const draft = draftOf(row);
              const busy = saving.has(row.key);
              return (
                <div
                  key={row.key}
                  className={`grid grid-cols-[12rem_repeat(3,minmax(0,1fr))_5rem] items-start gap-2 border-b border-zinc-100 px-1 py-2 ${
                    row.inactive ? "text-zinc-400" : ""
                  }`}
                >
                  <div className="min-w-0 pt-1.5">
                    <div className="truncate font-mono text-xs">{row.code}</div>
                    {row.context && (
                      <div className="truncate text-[11px] text-zinc-500">{row.context}</div>
                    )}
                  </div>
                  {CATALOG_LOCALES.map((loc) => (
                    <Input
                      key={loc}
                      value={draft[loc]}
                      placeholder={row.placeholders[loc]}
                      disabled={busy}
                      aria-label={`${row.code} ${loc.toUpperCase()}`}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.key]: { ...draft, [loc]: e.target.value },
                        }))
                      }
                      className={
                        requiredLocales.includes(loc) && !draft[loc].trim()
                          ? "border-red-300"
                          : !row.labels[loc]
                            ? "border-amber-300"
                            : undefined
                      }
                    />
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 px-2 text-xs"
                    disabled={!isDirty(row) || invalid(row) || busy}
                    onClick={() => void save(row).catch(() => undefined)}
                  >
                    {busy ? "…" : "Save"}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Card>
  );
}
