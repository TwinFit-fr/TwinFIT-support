"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { ReferenceLink, ReferenceTarget } from "@/lib/images/types";
import { referenceTargetKey } from "@/lib/images/types";
import { cn } from "@/lib/utils";
import { selectClass } from "./form-ui";

export type PickerExercise = {
  exo_id: number;
  display_name: string;
  primary_muscle_group: { id: string; name: string } | null;
};

export type PickerOptions = {
  exercises: PickerExercise[];
  groups: { id: string; name: string }[];
  muscles: { id: string; name: string }[];
};

export const TARGET_KIND_LABEL: Record<ReferenceTarget["kind"], string> = {
  muscle_group: "Group",
  muscle: "Muscle",
  exercise: "Exercise",
};

const KIND_STYLE: Record<ReferenceTarget["kind"], string> = {
  muscle_group: "bg-sky-50 text-sky-800 border-sky-200",
  muscle: "bg-violet-50 text-violet-800 border-violet-200",
  exercise: "bg-zinc-50 text-zinc-700 border-zinc-200",
};

/** A linked target: kind tag + name, optionally removable. */
export function TargetChip({ link, onRemove }: { link: ReferenceLink; onRemove?: () => void }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        KIND_STYLE[link.kind],
      )}
    >
      <span className="opacity-60">{TARGET_KIND_LABEL[link.kind]}</span>
      <span className="truncate font-medium">{link.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${link.name}`}
          className="rounded-full opacity-60 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/** Pick the exercises, muscles and groups a reference is sent for. Links are explicit only. */
export function ReferenceTargetPicker({
  value,
  onChange,
  options,
}: {
  value: ReferenceLink[];
  onChange: (next: ReferenceLink[]) => void;
  options: PickerOptions;
}) {
  const [query, setQuery] = useState("");
  const chosen = useMemo(() => new Set(value.map(referenceTargetKey)), [value]);

  const all = useMemo<ReferenceLink[]>(
    () => [
      ...options.groups.map((g) => ({ kind: "muscle_group" as const, id: g.id, name: g.name })),
      ...options.muscles.map((m) => ({ kind: "muscle" as const, id: m.id, name: m.name })),
      ...options.exercises.map((e) => ({
        kind: "exercise" as const,
        id: e.exo_id,
        name: e.display_name,
      })),
    ],
    [options],
  );

  const q = query.trim().toLowerCase();
  const results = q
    ? all
        .filter((link) => !chosen.has(referenceTargetKey(link)))
        .filter(
          (link) =>
            link.name.toLowerCase().includes(q) ||
            (link.kind === "exercise" && String(link.id) === q.replace("#", "")),
        )
        .slice(0, 8)
    : [];

  function add(links: ReferenceLink[]) {
    const fresh = links.filter((link) => !chosen.has(referenceTargetKey(link)));
    if (fresh.length) onChange([...value, ...fresh]);
  }

  function linkGroupExercises(groupId: string) {
    add(
      options.exercises
        .filter((e) => e.primary_muscle_group?.id === groupId)
        .map((e) => ({ kind: "exercise" as const, id: e.exo_id, name: e.display_name })),
    );
  }

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {value.map((link) => (
            <TargetChip
              key={referenceTargetKey(link)}
              link={link}
              onRemove={() =>
                onChange(value.filter((v) => referenceTargetKey(v) !== referenceTargetKey(link)))
              }
            />
          ))}
        </div>
      ) : (
        <p className="text-xs italic text-zinc-400">Not linked: only added by hand to a run.</p>
      )}
      <div className="relative">
        <input
          className={cn(selectClass, "mt-0")}
          placeholder="Search exercises, muscles or groups…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
            {results.map((link) => (
              <li key={referenceTargetKey(link)}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50"
                  onClick={() => {
                    add([link]);
                    setQuery("");
                  }}
                >
                  <span className="w-16 shrink-0 text-[11px] text-zinc-400">
                    {TARGET_KIND_LABEL[link.kind]}
                  </span>
                  <span className="truncate">{link.name}</span>
                  {link.kind === "exercise" && (
                    <span className="ml-auto text-[11px] tabular-nums text-zinc-400">
                      #{link.id}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
          value=""
          onChange={(e) => e.target.value && linkGroupExercises(e.target.value)}
        >
          <option value="">Link all exercises of a group…</option>
          {options.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {value.length > 0 && (
          <button
            type="button"
            className="text-xs text-zinc-500 underline"
            onClick={() => onChange([])}
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
