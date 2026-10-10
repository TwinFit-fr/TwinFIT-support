"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";

export type MuscleOption = { code: string; name: string };

/** One target muscle and ordered secondary muscles, by code. */
export type MuscleSet = { target: string; secondary: string[] };

const selectClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:bg-zinc-50";

/**
 * Picks a target muscle and an ordered list of secondary muscles (pairs and custom exercises).
 * The target never appears among the secondaries: choosing it as target drops it from them.
 */
export function MuscleSetEditor({
  muscles,
  value,
  onChange,
  disabled = false,
}: {
  muscles: MuscleOption[];
  value: MuscleSet;
  onChange: (value: MuscleSet) => void;
  disabled?: boolean;
}) {
  const nameOf = new Map(muscles.map((m) => [m.code, m.name]));
  const addable = muscles.filter(
    (m) => m.code !== value.target && !value.secondary.includes(m.code),
  );

  function move(index: number, delta: number) {
    const next = [...value.secondary];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange({ ...value, secondary: next });
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-zinc-600">
        Target muscle
        <select
          className={selectClass}
          value={value.target}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              target: e.target.value,
              secondary: value.secondary.filter((code) => code !== e.target.value),
            })
          }
        >
          <option value="">Select…</option>
          {muscles.map((m) => (
            <option key={m.code} value={m.code}>
              {m.name} ({m.code})
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="text-xs font-medium text-zinc-600">
          Secondary muscles ({value.secondary.length})
        </p>
        {value.secondary.length === 0 ? (
          <p className="mt-1 text-xs text-zinc-500">None</p>
        ) : (
          <ol className="mt-1 space-y-1">
            {value.secondary.map((code, index) => (
              <li
                key={code}
                className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm"
              >
                <span className="w-5 text-xs text-zinc-400">{index + 1}</span>
                <span className="flex-1">
                  {nameOf.get(code) ?? code}{" "}
                  <span className="font-mono text-xs text-zinc-500">{code}</span>
                </span>
                <IconButton
                  label="Move up"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label="Move down"
                  disabled={disabled || index === value.secondary.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label="Remove"
                  disabled={disabled}
                  onClick={() =>
                    onChange({ ...value, secondary: value.secondary.filter((c) => c !== code) })
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </li>
            ))}
          </ol>
        )}
        <select
          className={selectClass}
          value=""
          disabled={disabled || addable.length === 0}
          onChange={(e) => {
            if (e.target.value) {
              onChange({ ...value, secondary: [...value.secondary, e.target.value] });
            }
          }}
        >
          <option value="">Add secondary…</option>
          {addable.map((m) => (
            <option key={m.code} value={m.code}>
              {m.name} ({m.code})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Read-only chips of a muscle set: target strong, secondaries light, in order. */
export function MuscleSetChips({
  muscles,
  value,
}: {
  muscles: MuscleOption[];
  value: MuscleSet;
}) {
  const nameOf = new Map(muscles.map((m) => [m.code, m.name]));
  if (!value.target && value.secondary.length === 0) {
    return <span className="text-xs text-zinc-500">No muscles yet</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {value.target && (
        <span className="rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs">
          {nameOf.get(value.target) ?? value.target}
        </span>
      )}
      {value.secondary.map((code) => (
        <span
          key={code}
          className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600"
        >
          {nameOf.get(code) ?? code}
        </span>
      ))}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
