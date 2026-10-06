"use client";

import { AuthedImage } from "@/components/images/authed-image";
import { CHECKER_STYLE } from "@/components/images/checker";
import type { StyleReference } from "@/lib/images/types";
import type { SkippableInput } from "@/lib/images/job-types";
import { MAX_RUN_REFERENCES } from "@/lib/images/types";
import { cn } from "@/lib/utils";

/** An input the style sends by its own rules (character, support, logo, muscle base). */
export type AutomaticInput = {
  label: string;
  detail?: string;
  fileId: string | null;
  /** Set when a run may leave this input out. */
  skip?: SkippableInput;
};

/** Library reference ids a run sends: `undefined` keeps the target's linked references. */
export type RunReferences = string[] | undefined;

export function linkedReferenceIds(linked: StyleReference[]): string[] {
  return linked.filter((r) => r.file_id).map((r) => r.id);
}

/** Library references a run sends, from its choice or the target's links. */
export function effectiveReferenceIds(value: RunReferences, linked: StyleReference[]): string[] {
  return value ?? linkedReferenceIds(linked);
}

function Thumb({ fileId, alt }: { fileId: string | null; alt: string }) {
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-zinc-200"
      style={CHECKER_STYLE}
    >
      {fileId ? (
        <AuthedImage fileId={fileId} alt={alt} className="h-full w-full object-contain" />
      ) : (
        <span className="text-[9px] text-zinc-400">none</span>
      )}
    </span>
  );
}

/**
 * What a generation sends besides the prompt: the style's automatic inputs, then the library
 * references. Linked references start on; others can be added for this run only.
 */
export function RunInputsPanel({
  automatic,
  automaticLast,
  linked,
  library,
  value,
  onChange,
  skipped = [],
  onSkippedChange,
  note,
  disabled,
}: {
  automatic: AutomaticInput[];
  /** Automatic inputs sent after the library references (the logo). */
  automaticLast?: AutomaticInput[];
  linked: StyleReference[];
  library: StyleReference[];
  value: RunReferences;
  onChange: (next: RunReferences) => void;
  /** Automatic inputs this run leaves out. */
  skipped?: SkippableInput[];
  onSkippedChange?: (next: SkippableInput[]) => void;
  note?: string;
  disabled?: boolean;
}) {
  const chosen = effectiveReferenceIds(value, linked);
  const linkedIds = new Set(linked.map((r) => r.id));
  const rows = [...linked, ...library.filter((r) => chosen.includes(r.id) && !linkedIds.has(r.id))];
  const addable = library.filter((r) => r.file_id && !rows.some((row) => row.id === r.id));
  const edited =
    skipped.length > 0 ||
    (value !== undefined && value.join(",") !== linkedReferenceIds(linked).join(","));
  const full = chosen.length >= MAX_RUN_REFERENCES;

  function toggle(id: string) {
    onChange(chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);
  }

  const automaticRow = (input: AutomaticInput) => {
    const { skip } = input;
    const optional = Boolean(skip && input.fileId && onSkippedChange);
    const off = skip ? skipped.includes(skip) : false;
    return (
      <li key={input.label} className={cn("flex items-center gap-2", off && "opacity-50")}>
        {optional && skip && (
          <input
            type="checkbox"
            checked={!off}
            disabled={disabled}
            aria-label={`Send ${input.label}`}
            onChange={(e) =>
              onSkippedChange?.(
                e.target.checked ? skipped.filter((s) => s !== skip) : [...skipped, skip],
              )
            }
            className="h-4 w-4 rounded border-zinc-300"
          />
        )}
        <Thumb fileId={input.fileId} alt={input.label} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-zinc-800">{input.label}</span>
          {input.detail && (
            <span className="block truncate text-[11px] text-zinc-500">{input.detail}</span>
          )}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">
          {!input.fileId ? "missing" : off ? "left out" : "automatic"}
        </span>
      </li>
    );
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">
          Inputs
          {edited && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              edited for this run
            </span>
          )}
        </p>
        {edited && (
          <button
            type="button"
            className="text-xs text-zinc-600 underline"
            disabled={disabled}
            onClick={() => {
              onChange(undefined);
              onSkippedChange?.([]);
            }}
          >
            Reset
          </button>
        )}
      </div>
      {note && <p className="text-[11px] text-zinc-500">{note}</p>}

      {automatic.length > 0 && <ul className="space-y-1.5">{automatic.map(automaticRow)}</ul>}

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Library · {chosen.length}/{MAX_RUN_REFERENCES}
        </p>
        {rows.length === 0 ? (
          <p className="text-[11px] italic text-zinc-400">No references linked to this target.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((reference) => {
              const on = chosen.includes(reference.id);
              const missing = !reference.file_id;
              return (
                <li key={reference.id}>
                  <label
                    className={cn(
                      "flex items-center gap-2",
                      (missing || disabled) && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={disabled || missing || (!on && full)}
                      onChange={() => toggle(reference.id)}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    <Thumb fileId={reference.file_id} alt={reference.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-zinc-800">
                        {reference.name}
                      </span>
                      <span className="block truncate text-[11px] text-zinc-500">
                        {missing ? "No image yet: skipped" : reference.instruction || "—"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">
                      {linkedIds.has(reference.id) ? "linked" : "this run"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {addable.length > 0 && (
          <select
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
            value=""
            disabled={disabled || full}
            onChange={(e) => e.target.value && onChange([...chosen, e.target.value])}
          >
            <option value="">Add from library for this run…</option>
            {addable.map((reference) => (
              <option key={reference.id} value={reference.id}>
                {reference.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {automaticLast && automaticLast.length > 0 && (
        <ul className="space-y-1.5">{automaticLast.map(automaticRow)}</ul>
      )}
    </div>
  );
}
