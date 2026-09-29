"use client";

import { PROMPT_PLACEHOLDERS } from "@/lib/images/prompt";
import { framePositionLabel } from "@/lib/images/types";
import { cn } from "@/lib/utils";

/** Edited texts only; a missing key means "use the template from settings". */
export type PromptOverrides = {
  system?: string;
  positions: Partial<Record<number, string>>;
  /** False = do not send the active Start frame as context for Mid/End. */
  startContext?: boolean;
};

export const NO_OVERRIDES: PromptOverrides = { positions: {} };

export function countOverrides(overrides: PromptOverrides, positions: number[]): number {
  return (
    (overrides.system != null ? 1 : 0) +
    positions.filter((p) => overrides.positions[p] != null).length
  );
}

function OverrideField({
  label,
  template,
  value,
  disabled,
  onChange,
}: {
  label: string;
  template: string;
  value: string | undefined;
  disabled?: boolean;
  onChange: (next: string | undefined) => void;
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
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(undefined)}
            className="text-[11px] font-normal text-zinc-500 underline hover:text-zinc-800"
          >
            Reset
          </button>
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
  usesStrip,
}: {
  positions: number[];
  systemTemplate: string;
  positionTemplates: Record<number, string>;
  value: PromptOverrides;
  onChange: (next: PromptOverrides) => void;
  disabled?: boolean;
  /** Thumbnail of the exercise's active Start frame, if any. */
  startThumbUrl: string | null;
  /** The run draws all positions in one strip, so no frame is sent as context. */
  usesStrip: boolean;
}) {
  const showStartContext = positions.some((p) => p !== 0) && !usesStrip;
  const edits = countOverrides(value, positions);
  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-zinc-800">Prompts for this generation</div>
          <p className="text-xs text-zinc-500">
            Changes apply only to the next generations on this page and are never saved.
            Placeholders {PROMPT_PLACEHOLDERS.join(", ")} are filled in when generating.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || edits === 0}
          onClick={() => onChange({ positions: {}, startContext: value.startContext })}
          className="text-xs text-zinc-500 underline hover:text-zinc-800 disabled:no-underline disabled:opacity-40"
        >
          Reset all
        </button>
      </div>
      {showStartContext && (
        <div className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          {startThumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={startThumbUrl}
              alt="Active Start frame"
              className="h-16 w-16 shrink-0 rounded border border-zinc-200 bg-white object-contain"
            />
          )}
          <label className="space-y-0.5 text-xs text-zinc-700">
            <span className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={Boolean(startThumbUrl) && value.startContext !== false}
                disabled={disabled || !startThumbUrl}
                onChange={(e) => onChange({ ...value, startContext: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Send active Start as context
            </span>
            <span className="block text-zinc-500">
              {startThumbUrl
                ? "Mid/End are drawn by editing this Start image (same character, camera and scale; subject follows the Start). Describe the change in the position prompt, e.g. alternate arms and legs."
                : "No active Start frame: Mid/End are generated from the character reference."}
            </span>
          </label>
        </div>
      )}
      <OverrideField
        label="System (style)"
        template={systemTemplate}
        value={value.system}
        disabled={disabled}
        onChange={(system) => onChange({ ...value, system })}
      />
      <div className={cn("grid gap-3", positions.length > 1 && "lg:grid-cols-2 xl:grid-cols-3")}>
        {positions.map((position) => (
          <OverrideField
            key={position}
            label={`Position ${position} · ${framePositionLabel(position)}`}
            template={positionTemplates[position] ?? ""}
            value={value.positions[position]}
            disabled={disabled}
            onChange={(text) =>
              onChange({ ...value, positions: { ...value.positions, [position]: text } })
            }
          />
        ))}
      </div>
    </div>
  );
}
