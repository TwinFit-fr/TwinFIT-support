"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ModelSection } from "@/components/images/settings/model-section";
import { Field, Section } from "@/components/images/settings/form-ui";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import { DEFAULT_GENERATION_PARAMS, KNOWN_IMAGE_MODELS } from "@/lib/images/capabilities";
import type { GenerationParams } from "@/lib/images/types";
import type { MuscleMapSettings } from "@/lib/muscle-map/types";
import { errorText } from "./shared";
import type { MuscleMapApi } from "./use-muscle-map";

type Draft = Omit<MuscleMapSettings, "updated_at" | "generation"> & {
  generation: GenerationParams;
};

function draftOf(settings: MuscleMapSettings): Draft {
  return {
    target_color: settings.target_color,
    secondary_color: settings.secondary_color,
    key_color: settings.key_color,
    generation: { ...DEFAULT_GENERATION_PARAMS, ...settings.generation },
    base_prompt: settings.base_prompt,
    mask_prompt: settings.mask_prompt,
  };
}

/** Colors, prompts and model params of the muscle map (its own; not the image styles'). */
export function SettingsPanel({ api }: { api: MuscleMapApi }) {
  const settings = api.data!.settings;
  const toast = useToast();
  const models = useStaffSWR<{ models: Array<{ id: string }> }>("/api/images/models");
  const [draft, setDraft] = useState<Draft>(() => draftOf(settings));
  const [savedAt, setSavedAt] = useState(settings.updated_at);
  const [saving, setSaving] = useState(false);

  // Someone else saved: take their values (keeps local edits otherwise).
  if (settings.updated_at !== savedAt) {
    setSavedAt(settings.updated_at);
    setDraft(draftOf(settings));
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(settings));
  const modelIds = models.data?.models.map((m) => m.id) ?? [...KNOWN_IMAGE_MODELS];
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  async function save() {
    setSaving(true);
    try {
      await api.saveSettings(draft);
      toast.success("Muscle map settings saved");
    } catch (error) {
      toast.error(errorText(error, "Saving the settings failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="Colors"
        description="Target and secondary paint the exercise's muscles (#RRGGBB or #RRGGBBAA). The model paints a muscle with the key color, and masks are extracted from it."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <ColorField label="Target" value={draft.target_color} onChange={(v) => set({ target_color: v })} />
          <ColorField
            label="Secondary"
            value={draft.secondary_color}
            onChange={(v) => set({ secondary_color: v })}
          />
          <ColorField label="Key color" value={draft.key_color} onChange={(v) => set({ key_color: v })} />
        </div>
      </Section>

      <Section title="Prompts" description="Placeholders are replaced when generating.">
        <label className="block text-xs font-medium text-zinc-600">
          Base prompt · {"{view}"}
          <textarea
            className="mt-1 min-h-40 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs"
            value={draft.base_prompt}
            onChange={(e) => set({ base_prompt: e.target.value })}
          />
        </label>
        <label className="block text-xs font-medium text-zinc-600">
          Mask prompt · {"{view} {muscle} {muscle_description} {key_color}"}
          <textarea
            className="mt-1 min-h-40 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs"
            value={draft.mask_prompt}
            onChange={(e) => set({ mask_prompt: e.target.value })}
          />
        </label>
      </Section>

      <Section
        title="Model"
        description="Bases use a transparent background; masks edit the active base of their view."
      >
        <ModelSection
          params={draft.generation}
          models={modelIds}
          onChange={(generation) => set({ generation })}
        />
      </Section>

      <div className="flex gap-2">
        <Button type="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!dirty || saving}
          onClick={() => setDraft(draftOf(settings))}
        >
          Discard changes
        </Button>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="color"
        aria-label={`${label} color`}
        value={/^#[0-9a-fA-F]{6}/.test(value) ? value.slice(0, 7) : "#000000"}
        onChange={(e) => onChange(e.target.value.toUpperCase() + value.slice(7))}
        className="h-8 w-10 cursor-pointer rounded border border-zinc-300"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="w-32 font-mono" />
      <span
        className="h-8 w-8 rounded border border-zinc-300"
        style={{ backgroundColor: value }}
        aria-hidden
      />
    </Field>
  );
}
