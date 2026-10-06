"use client";

import { PROMPT_PLACEHOLDERS } from "@/lib/images/prompt";
import { framePositionLabel } from "@/lib/images/types";
import { cn } from "@/lib/utils";

/** Edited texts only; a missing key means "use the template from settings". */
export type PromptOverrides = {
  system?: string;
  positions: Partial<Record<number, string>>;
};

export const NO_OVERRIDES: PromptOverrides = { positions: {} };

export function countOverrides(overrides: PromptOverrides, positions: number[]): number {
  return (
    (overrides.system != null ? 1 : 0) +
    positions.filter((p) => overrides.positions[p] != null).length
  );
}

/** Explains which Start frame Mid/End will be drawn from; `blocking` when there is none. */
function startContextNote(newStart: boolean, hasActiveStart: boolean) {
  if (newStart) {
    return { title: "Mid/End will edit the new Start", blocking: false };
  }
  if (hasActiveStart) {
    return { title: "Mid/End edit this Start", blocking: false };
  }
  return { title: "No active Start — generate Start first", blocking: true };
}

function OverrideField({
  label,
  template,
  value,
  disabled,
  onChange,
  onSaveToStyle,
}: {
  label: string;
  template: string;
  value: string | undefined;
  disabled?: boolean;
  onChange: (next: string | undefined) => void;
  /** Make this run's text the style's prompt for the slot. */
  onSaveToStyle?: () => void;
}) {
  const edited = value != null;
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-600">
        <span>
          {label}
          {edited && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              edited
            </span>
          )}
        </span>
        {edited && (
          <span className="flex gap-2">
            {onSaveToStyle && (
              <button
                type="button"
                disabled={disabled}
                onClick={onSaveToStyle}
                className="text-[11px] font-normal text-zinc-700 underline hover:text-zinc-950"
              >
                Save to style
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(undefined)}
              className="text-[11px] font-normal text-zinc-500 underline hover:text-zinc-800"
            >
              Reset
            </button>
          </span>
        )}
      </span>
      <textarea
        value={value ?? template}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === template ? undefined : e.target.value)}
        className={cn(
          "min-h-40 w-full rounded-md border px-3 py-2 font-mono text-xs",
          edited ? "border-amber-300 bg-amber-50/40" : "border-zinc-300",
        )}
      />
    </label>
  );
}

/** Per-run prompt edits for the selected positions. Nothing here is saved. */
export function PromptOverridesPanel({
  positions,
  systemTemplate,
  positionTemplates,
  value,
  onChange,
  disabled,
  startThumbUrl,
  onSaveToStyle,
}: {
  positions: number[];
  systemTemplate: string;
  positionTemplates: Record<number, string>;
  value: PromptOverrides;
  onChange: (next: PromptOverrides) => void;
  disabled?: boolean;
  /** Thumbnail of the exercise's active Start frame, if any. */
  startThumbUrl: string | null;
  /** Saves a run edit as the style's prompt of that slot. */
  onSaveToStyle?: (slot: "system" | number, text: string) => void;
}) {
  const showStartContext = positions.some((p) => p !== 0);
  // When the run also draws Start, Mid/End edit that new Start instead of the active one.
  const newStart = positions.includes(0);
  const note = startContextNote(newStart, Boolean(startThumbUrl));
  const edits = countOverrides(value, positions);
  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-800">
          Prompts
          <span className="ml-2 text-xs font-normal text-zinc-400">this run only</span>
        </div>
        <button
          type="button"
          disabled={disabled || edits === 0}
          onClick={() => onChange(NO_OVERRIDES)}
          title="Reset to style defaults"
          className="text-xs text-zinc-500 underline hover:text-zinc-800 disabled:no-underline disabled:opacity-40"
        >
          Reset all
        </button>
      </div>
      {showStartContext && (
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg border px-3 py-2 text-xs",
            note.blocking ? "border-amber-200 bg-amber-50 text-amber-800" : "border-zinc-200 bg-zinc-50 text-zinc-600",
          )}
        >
          {startThumbUrl && !newStart && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={startThumbUrl}
              alt="Active Start"
              className="h-10 w-10 shrink-0 rounded border border-zinc-200 bg-white object-contain"
            />
          )}
          <span className="font-medium">{note.title}</span>
        </div>
      )}
      <OverrideField
        label="System"
        template={systemTemplate}
        value={value.system}
        disabled={disabled}
        onChange={(system) => onChange({ ...value, system })}
        onSaveToStyle={
          onSaveToStyle && value.system != null
            ? () => onSaveToStyle("system", value.system as string)
            : undefined
        }
      />
      <div className={cn("grid gap-3", positions.length > 1 && "lg:grid-cols-2 xl:grid-cols-3")}>
        {positions.map((position) => (
          <OverrideField
            key={position}
            label={framePositionLabel(position)}
            template={positionTemplates[position] ?? ""}
            value={value.positions[position]}
            disabled={disabled}
            onChange={(text) =>
              onChange({ ...value, positions: { ...value.positions, [position]: text } })
            }
            onSaveToStyle={
              onSaveToStyle && value.positions[position] != null
                ? () => onSaveToStyle(position, value.positions[position] as string)
                : undefined
            }
          />
        ))}
      </div>
      <p className="text-[11px] text-zinc-400">
        Placeholders: {PROMPT_PLACEHOLDERS.exercise.join(", ")}
      </p>
    </div>
  );
}
