"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { mutate } from "swr";
import { Button, Input, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  BACKGROUNDS,
  FORMATS,
  INPUT_FIDELITIES,
  MAX_CONCURRENCY_LIMIT,
  MODERATIONS,
  QUALITIES,
  SHAPES,
  SIZE_TIERS,
  capabilitiesFor,
  isShapeSupported,
  resolveSize,
  sequenceStripSize,
  validateGenerationParams,
} from "@/lib/images/capabilities";
import type { GenerationParams, ImagePrompt, ImageSettings, Subject } from "@/lib/images/types";
import { FRAME_POSITIONS, POSITION_PROMPT_KEYS, REFERENCE_KEYS, SUBJECTS } from "@/lib/images/types";
import { imageThumbUrl, storageFileUrl } from "@/lib/images/urls";
import { cn } from "@/lib/utils";

type ModelsResponse = { models: { id: string }[] };
type PromptsResponse = { system: ImagePrompt[]; position: ImagePrompt[] };
type Draft = Pick<
  ImageSettings,
  "params" | "system_prompt_id" | "start_prompt_id" | "mid_prompt_id" | "end_prompt_id"
>;

function toDraft(settings: ImageSettings): Draft {
  return {
    params: settings.params,
    system_prompt_id: settings.system_prompt_id,
    start_prompt_id: settings.start_prompt_id,
    mid_prompt_id: settings.mid_prompt_id,
    end_prompt_id: settings.end_prompt_id,
  };
}

/** Replace values the chosen model cannot use with safe ones. */
function coerceToModel(params: GenerationParams): GenerationParams {
  const caps = capabilitiesFor(params.model);
  const next = { ...params };
  if (!isShapeSupported(next.model, next.shape)) next.shape = "square";
  if (next.background === "transparent" && !caps.transparent) next.background = "auto";
  if (!caps.qualities.includes(next.quality)) next.quality = "auto";
  return next;
}

function Chip({
  selected,
  disabled,
  title,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40",
        selected
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100",
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-zinc-600">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </fieldset>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {description && <p className="text-xs text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const selectClass = "mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function ReferenceCard({
  subject,
  fileId,
  busy,
  onAction,
}: {
  subject: Subject;
  fileId: string | null;
  busy: boolean;
  onAction: (subject: Subject, action: "generate" | "remove" | File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const url = imageThumbUrl(storageFileUrl(fileId), 480);
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
      <div className="text-sm font-medium capitalize text-zinc-800">{subject}</div>
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-zinc-100">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${subject} reference`} className="h-full w-full object-contain" />
        ) : (
          <span className="px-4 text-center text-xs text-zinc-400">
            No reference — generations for this subject use the prompt only.
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onAction(subject, file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          Upload
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => onAction(subject, "generate")}>
          {busy ? "Working…" : "Generate"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || !fileId}
          onClick={() => onAction(subject, "remove")}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

export function ImageSettingsPage() {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const { data, isLoading, error } = useStaffSWR<ImageSettings>("/api/images/settings");
  const { data: modelsData } = useStaffSWR<ModelsResponse>("/api/images/models");
  const { data: promptsData } = useStaffSWR<PromptsResponse>("/api/images/prompts");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [referenceBusy, setReferenceBusy] = useState<Subject | null>(null);

  // Initialise once; later refreshes (e.g. reference changes) must not wipe unsaved edits.
  useEffect(() => {
    if (data && !draft) setDraft(toDraft(data));
  }, [data, draft]);

  const models = useMemo(() => {
    const ids = (modelsData?.models ?? []).map((m) => m.id);
    if (draft && !ids.includes(draft.params.model)) ids.unshift(draft.params.model);
    return ids;
  }, [modelsData, draft]);

  if (isLoading || !draft || !data) {
    return error ? (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error.message}
      </div>
    ) : (
      <Skeleton className="h-[60vh] w-full rounded-xl" />
    );
  }

  const params = draft.params;
  const caps = capabilitiesFor(params.model);
  const issues = validateGenerationParams(params);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(data));
  const setParams = (patch: Partial<GenerationParams>) =>
    setDraft({ ...draft, params: { ...params, ...patch } });

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = (await staffFetch("/api/images/settings", {
        method: "PUT",
        body: JSON.stringify(draft),
      })) as ImageSettings;
      await mutate("/api/images/settings", saved, { revalidate: false });
      setDraft(toDraft(saved));
      success("Settings saved");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function referenceAction(subject: Subject, action: "generate" | "remove" | File) {
    if (action === "generate") {
      const note = dirty ? "\n\nUnsaved changes are ignored: the saved settings are used." : "";
      if (!window.confirm(`Generate a new ${subject} reference with OpenAI?${note}`)) return;
    }
    if (action === "remove" && !window.confirm(`Remove the ${subject} reference?`)) return;
    setReferenceBusy(subject);
    try {
      let updated: ImageSettings;
      if (action === "remove") {
        updated = (await staffFetch(`/api/images/settings/reference?subject=${subject}`, {
          method: "DELETE",
        })) as ImageSettings;
      } else if (action === "generate") {
        updated = (await staffFetch("/api/images/settings/reference", {
          method: "POST",
          body: JSON.stringify({ action: "generate", subject }),
        })) as ImageSettings;
      } else {
        updated = (await staffFetch("/api/images/settings/reference", {
          method: "POST",
          body: JSON.stringify({
            action: "upload",
            subject,
            mimeType: action.type,
            data: await readAsBase64(action),
          }),
        })) as ImageSettings;
      }
      await mutate("/api/images/settings", updated, { revalidate: false });
      success(action === "remove" ? "Reference removed" : "Reference updated");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Reference update failed");
    } finally {
      setReferenceBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
          <p className="text-sm text-zinc-500">
            Everything used to generate images. Shared by all staff.
            {data.updated_at ? ` Last saved ${new Date(data.updated_at).toLocaleString()}.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty || saving}
            onClick={() => setDraft(toDraft(data))}
          >
            Discard
          </Button>
          <Button
            type="button"
            disabled={!dirty || saving || issues.length > 0}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <Section title="Model & output">
        <label className="block max-w-sm text-xs font-medium text-zinc-600">
          Model
          <select
            className={selectClass}
            value={params.model}
            onChange={(e) =>
              setDraft({ ...draft, params: coerceToModel({ ...params, model: e.target.value }) })
            }
          >
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] font-normal text-zinc-500">
            {caps.customSize ? "Custom sizes" : "Fixed sizes"} ·{" "}
            {caps.transparent ? "transparent supported" : "no transparent background"} ·{" "}
            {caps.inputFidelity ? "reference fidelity supported" : "no reference fidelity"}
          </span>
        </label>

        <Field
          label="Shape"
          hint={`Output size: ${resolveSize(params)} · "All" ${
            sequenceStripSize(params)
              ? `draws the 3 poses in one ${sequenceStripSize(params)} strip (same scale)`
              : "generates each position separately (needs a custom-size model and square/portrait shape for the 3-pose strip)"
          }`}
        >
          {SHAPES.map((shape) => {
            const supported = isShapeSupported(params.model, shape.id);
            return (
              <Chip
                key={shape.id}
                selected={params.shape === shape.id}
                disabled={!supported}
                title={supported ? undefined : "Needs a model with custom sizes"}
                onClick={() => setParams({ shape: shape.id })}
              >
                {shape.label} {shape.detail}
              </Chip>
            );
          })}
        </Field>

        {caps.customSize && (
          <Field label="Resolution">
            {SIZE_TIERS.map((tier) => (
              <Chip key={tier.id} selected={params.size === tier.id} onClick={() => setParams({ size: tier.id })}>
                {tier.label}
              </Chip>
            ))}
          </Field>
        )}

        <Field label="Background">
          {BACKGROUNDS.map((bg) => {
            const unsupported = bg.id === "transparent" && !caps.transparent;
            return (
              <Chip
                key={bg.id}
                selected={params.background === bg.id}
                disabled={unsupported}
                title={unsupported ? `${params.model} does not support transparency` : undefined}
                onClick={() =>
                  setParams({
                    background: bg.id,
                    ...(bg.id === "transparent" && params.format === "jpeg" ? { format: "png" } : {}),
                  })
                }
              >
                {bg.label}
              </Chip>
            );
          })}
        </Field>

        <Field
          label="Background color"
          hint="Injected into prompts through {background_color}. Ignored when the background is transparent unless your prompt uses it."
        >
          <input
            type="color"
            aria-label="Background color"
            value={/^#[0-9a-fA-F]{6}$/.test(params.background_color) ? params.background_color : "#000000"}
            onChange={(e) => setParams({ background_color: e.target.value.toUpperCase() })}
            className="h-8 w-10 cursor-pointer rounded border border-zinc-300"
          />
          <Input
            value={params.background_color}
            onChange={(e) => setParams({ background_color: e.target.value })}
            className="w-28 font-mono"
          />
        </Field>

        <Field label="Format">
          {FORMATS.map((format) => {
            const unsupported = format.id === "jpeg" && params.background === "transparent";
            return (
              <Chip
                key={format.id}
                selected={params.format === format.id}
                disabled={unsupported}
                title={unsupported ? "JPEG cannot be transparent" : undefined}
                onClick={() => setParams({ format: format.id })}
              >
                {format.label}
              </Chip>
            );
          })}
        </Field>

        {params.format !== "png" && (
          <label className="block max-w-sm text-xs font-medium text-zinc-600">
            Compression: {params.compression}%
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={params.compression}
              onChange={(e) => setParams({ compression: Number(e.target.value) })}
              className="mt-1 w-full"
            />
          </label>
        )}

        <Field label="Quality">
          {QUALITIES.map((quality) => {
            const supported = caps.qualities.includes(quality.id);
            return (
              <Chip
                key={quality.id}
                selected={params.quality === quality.id}
                disabled={!supported}
                title={supported ? undefined : "Only gpt-image-2.5 models"}
                onClick={() => setParams({ quality: quality.id })}
              >
                {quality.label}
              </Chip>
            );
          })}
        </Field>

        <Field label="Moderation" hint="Low = less restrictive content filtering.">
          {MODERATIONS.map((moderation) => (
            <Chip
              key={moderation.id}
              selected={params.moderation === moderation.id}
              onClick={() => setParams({ moderation: moderation.id })}
            >
              {moderation.label}
            </Chip>
          ))}
        </Field>
      </Section>

      <Section
        title="Prompts"
        description="Which templates are combined for each position (system + position)."
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-medium text-zinc-600">
            System (style)
            <select
              className={selectClass}
              value={draft.system_prompt_id ?? ""}
              onChange={(e) => setDraft({ ...draft, system_prompt_id: e.target.value || null })}
            >
              <option value="">— first available —</option>
              {(promptsData?.system ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {FRAME_POSITIONS.map((frame, i) => {
            const key = POSITION_PROMPT_KEYS[i];
            return (
              <label key={frame.id} className="block text-xs font-medium text-zinc-600">
                Position {frame.id} · {frame.label}
                <select
                  className={selectClass}
                  value={draft[key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value || null })}
                >
                  <option value="">— first available —</option>
                  {(promptsData?.position ?? [])
                    .filter((p) => p.position === frame.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            );
          })}
        </div>
        <Link href="/images/prompts" className="text-xs text-zinc-600 underline">
          Edit prompt texts
        </Link>
      </Section>

      <Section
        title="Character references"
        description="One global reference per subject. When present, every generation for that subject starts from it (OpenAI image edit) so the same character appears across the catalog. Upload, Generate and Remove apply immediately."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          {SUBJECTS.map((subject) => (
            <ReferenceCard
              key={subject}
              subject={subject}
              fileId={data[REFERENCE_KEYS[subject]]}
              busy={referenceBusy === subject}
              onAction={(s, a) => void referenceAction(s, a)}
            />
          ))}
        </div>
        <Field
          label="Reference fidelity"
          hint="High keeps face and features closer to the reference; lower it if poses copy the reference too much."
        >
          {INPUT_FIDELITIES.map((fidelity) => (
            <Chip
              key={fidelity.id}
              selected={params.input_fidelity === fidelity.id}
              disabled={!caps.inputFidelity}
              title={caps.inputFidelity ? undefined : `${params.model} ignores fidelity`}
              onClick={() => setParams({ input_fidelity: fidelity.id })}
            >
              {fidelity.label}
            </Chip>
          ))}
        </Field>
      </Section>

      <Section title="Throughput">
        <label className="block max-w-xs text-xs font-medium text-zinc-600">
          Concurrent OpenAI requests: {params.max_concurrency}
          <input
            type="range"
            min={1}
            max={MAX_CONCURRENCY_LIMIT}
            value={params.max_concurrency}
            onChange={(e) => setParams({ max_concurrency: Number(e.target.value) })}
            className="mt-1 w-full"
          />
          <span className="mt-1 block text-[11px] font-normal text-zinc-500">
            With 3, the three positions of an exercise run at the same time.
          </span>
        </label>
      </Section>
    </div>
  );
}
