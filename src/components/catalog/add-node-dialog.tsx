"use client";

import { useMemo, useState } from "react";
import {
  getLevelByKey,
  normTaxonomy,
  pathKey,
  type LookupRow,
} from "@/lib/catalog/exercise-path";
import { Button, Input } from "@/components/ui/primitives";

type AddNodeDialogProps = {
  levelKey: string;
  prefixParts: string[];
  lookupCodes: LookupRow[];
  usedValues: Set<string>;
  onConfirm: (values: string[]) => void;
  onCancel: () => void;
};

export function AddNodeDialog({
  levelKey,
  prefixParts,
  lookupCodes,
  usedValues,
  onConfirm,
  onCancel,
}: AddNodeDialogProps) {
  const level = getLevelByKey(levelKey);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState("");

  const available = useMemo(
    () =>
      lookupCodes
        .filter((r) => !usedValues.has(r.code))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [lookupCodes, usedValues],
  );

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function handleConfirm() {
    const values: string[] = [...selected];
    const customNorm = normTaxonomy(custom);
    if (customNorm && !values.includes(customNorm)) values.push(customNorm);
    if (!values.length) return;
    onConfirm(values);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-lg font-semibold">Add {level?.label ?? "value"}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Pick existing values not yet used in this combination, or enter a new code below.
        </p>
        {prefixParts.length > 0 && (
          <p className="mt-1 text-xs text-zinc-400">
            Current path: {pathKey(prefixParts).replace(/\|/g, " → ")}
          </p>
        )}

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Existing values (not in this branch)
          </p>
          <div className="flex flex-wrap gap-2">
            {available.length === 0 && (
              <p className="text-sm text-zinc-500">
                All catalog values for this column are already in this branch.
              </p>
            )}
            {available.map((row) => (
              <button
                key={row.code}
                type="button"
                onClick={() => toggle(row.code)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  selected.has(row.code)
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 hover:border-zinc-400"
                }`}
              >
                <span className="font-mono">{row.code}</span>
                {row.name && row.name !== row.code && (
                  <span className="ml-1 text-xs opacity-80">{row.name}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">New code</label>
          <Input
            placeholder="e.g. FLY"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Creates a new lookup entry if the code does not exist yet.
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          <Button type="button" onClick={handleConfirm}>Add selected</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
