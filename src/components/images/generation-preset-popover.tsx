"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import type { GenerationParams } from "@/lib/images/types";
import type { ImagePrompt } from "@/lib/images/types";

type ModelsResponse = {
  models: { id: string; label: string }[];
  presets: {
    shapes: { id: string; label: string; detail?: string }[];
    sizes: { id: string; label: string }[];
    backgrounds: { id: string; label: string }[];
    formats: { id: string; label: string }[];
    qualities: { id: string; label: string }[];
  };
};

type PromptsResponse = {
  system: ImagePrompt[];
  exercise: ImagePrompt[];
};

type PresetState = GenerationParams & {
  systemPromptId: string | null;
  exercisePromptId: string | null;
};

export function GenerationPresetPopover({
  preset,
  onChange,
}: {
  preset: PresetState;
  onChange: (next: PresetState) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: modelsData } = useStaffSWR<ModelsResponse>("/api/images/models");
  const { data: promptsData } = useStaffSWR<PromptsResponse>("/api/images/prompts");

  useEffect(() => {
    if (!promptsData) return;
    if (preset.systemPromptId && preset.exercisePromptId) return;
    onChange({
      ...preset,
      systemPromptId:
        preset.systemPromptId ??
        promptsData.system.find((p) => p.is_default)?.id ??
        promptsData.system[0]?.id ??
        null,
      exercisePromptId:
        preset.exercisePromptId ??
        promptsData.exercise.find((p) => p.is_default)?.id ??
        promptsData.exercise[0]?.id ??
        null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptsData]);

  const summary = `${preset.model} · ${preset.shape} · ${preset.background}`;

  return (
    <div className="relative">
      <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)}>
        Preset: {summary}
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(92vw,420px)] rounded-xl border border-zinc-200 bg-white p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">Generation preset</h3>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-800"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          <label className="block text-xs font-medium text-zinc-600">
            Model
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              value={preset.model}
              onChange={(e) => onChange({ ...preset, model: e.target.value })}
            >
              {(modelsData?.models ?? [{ id: preset.model, label: preset.model }]).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          {(
            [
              ["shape", "Shape", modelsData?.presets.shapes],
              ["size", "Size", modelsData?.presets.sizes],
              ["background", "Background", modelsData?.presets.backgrounds],
              ["format", "Format", modelsData?.presets.formats],
              ["quality", "Quality", modelsData?.presets.qualities],
            ] as const
          ).map(([key, label, options]) => (
            <fieldset key={key} className="space-y-1">
              <legend className="text-xs font-medium text-zinc-600">{label}</legend>
              <div className="flex flex-wrap gap-1.5">
                {(options ?? []).map((opt) => {
                  const selected = preset[key] === opt.id;
                  const disabled =
                    (key === "quality" &&
                      (opt.id === "xhigh" || opt.id === "max") &&
                      !preset.model.startsWith("gpt-image-2.5")) ||
                    false;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange({ ...preset, [key]: opt.id })}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        selected
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                      } disabled:opacity-40`}
                    >
                      {"detail" in opt && opt.detail ? `${opt.label} ${opt.detail}` : opt.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <label className="block text-xs font-medium text-zinc-600">
            System prompt
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              value={preset.systemPromptId ?? ""}
              onChange={(e) => onChange({ ...preset, systemPromptId: e.target.value || null })}
            >
              {(promptsData?.system ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-zinc-600">
            Exercise prompt
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              value={preset.exercisePromptId ?? ""}
              onChange={(e) => onChange({ ...preset, exercisePromptId: e.target.value || null })}
            >
              {(promptsData?.exercise ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
