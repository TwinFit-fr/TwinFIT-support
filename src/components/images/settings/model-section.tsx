"use client";

import { Input } from "@/components/ui/primitives";
import {
  BACKGROUNDS,
  FORMATS,
  MODERATIONS,
  QUALITIES,
  SHAPES,
  SIZE_TIERS,
  capabilitiesFor,
  isShapeSupported,
  resolveSize,
} from "@/lib/images/capabilities";
import type { GenerationParams } from "@/lib/images/types";
import { Chip, Field, Section, selectClass } from "./form-ui";

/** Replace values the chosen model cannot use with safe ones. */
export function coerceToModel(params: GenerationParams): GenerationParams {
  const caps = capabilitiesFor(params.model);
  const next = { ...params };
  if (!isShapeSupported(next.model, next.shape)) next.shape = "square";
  if (next.background === "transparent" && !caps.transparent) next.background = "auto";
  if (!caps.qualities.includes(next.quality)) next.quality = "auto";
  return next;
}

export function ModelSection({
  params,
  models,
  onChange,
}: {
  params: GenerationParams;
  models: string[];
  onChange: (params: GenerationParams) => void;
}) {
  const caps = capabilitiesFor(params.model);
  const setParams = (patch: Partial<GenerationParams>) => onChange({ ...params, ...patch });

  return (
    <Section title="Model & output">
      <label className="block max-w-sm text-xs font-medium text-zinc-600">
        Model
        <select
          className={selectClass}
          value={params.model}
          onChange={(e) => onChange(coerceToModel({ ...params, model: e.target.value }))}
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

      <Field label="Shape" hint={`Output size: ${resolveSize(params)}`}>
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
            <Chip
              key={tier.id}
              selected={params.size === tier.id}
              onClick={() => setParams({ size: tier.id })}
            >
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
                  ...(bg.id === "transparent" && params.format === "jpeg"
                    ? { format: "png" }
                    : {}),
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
          value={
            /^#[0-9a-fA-F]{6}$/.test(params.background_color)
              ? params.background_color
              : "#000000"
          }
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
  );
}
