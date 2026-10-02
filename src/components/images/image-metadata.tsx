"use client";

import { capabilitiesFor, resolveSize } from "@/lib/images/capabilities";
import type { ExerciseImage, GenerationParams, ImagePrompt } from "@/lib/images/types";
import { framePositionLabel, targetPosition } from "@/lib/images/types";

function generationMethod(image: ExerciseImage): string {
  const p = image.params;
  if (!p) return "—";
  // Strips are no longer generated; older images keep showing how they were made.
  if (p.sequence)
    return `${p.sequence.cuts.length + 1}-pose strip ${p.sequence.strip_size} (cuts at ${p.sequence.cuts.join(" / ")})`;
  if (p.guide_image_id) return "Edit of the Start frame";
  if (p.reference_file_id) return "From character reference";
  return "Prompt only";
}

/** input_fidelity is only sent with an input image and on models that accept it. */
function fidelityLabel(image: ExerciseImage): string {
  const p = image.params;
  if (!p || !(p.reference_file_id || p.guide_image_id)) return "—";
  if (!capabilitiesFor(image.model).inputFidelity) return "Not supported by model";
  return p.input_fidelity ?? "—";
}

function usageLabel(usage: ExerciseImage["usage"]): string {
  if (!usage) return "—";
  const read = (key: string) => (typeof usage[key] === "number" ? (usage[key] as number) : null);
  const input = read("input_tokens");
  const output = read("output_tokens");
  const total = read("total_tokens");
  if (input == null && output == null && total == null) return "—";
  return [
    input != null ? `in ${input}` : null,
    output != null ? `out ${output}` : null,
    total != null ? `total ${total}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function promptName(prompts: ImagePrompt[] | undefined, id: string | null | undefined): string {
  if (!id) return "—";
  return prompts?.find((p) => p.id === id)?.name ?? "deleted prompt";
}

export function ImageMetadataPanel({
  image,
  prompts,
}: {
  image: ExerciseImage;
  prompts: ImagePrompt[] | undefined;
}) {
  const p = image.params ?? {};
  const target = targetPosition(image);
  const hasOutputParams = Boolean(p.model && p.shape && p.size);
  const rows: [string, string][] = [
    [
      "Position",
      image.active
        ? `${image.position} · ${framePositionLabel(image.position)} (active)`
        : `Inactive${target != null ? ` · generated for ${framePositionLabel(target)}` : ""}`,
    ],
    ["Subject", p.subject ?? "—"],
    ["Method", generationMethod(image)],
    ["Model", image.model || "—"],
    [
      "Output",
      hasOutputParams
        ? `${p.shape} ${p.size} → ${resolveSize(p as GenerationParams)} · ${p.format ?? "—"}${
            p.format && p.format !== "png" ? ` ${p.compression}%` : ""
          }`
        : "—",
    ],
    [
      "Background",
      p.background ? `${p.background}${p.background_color ? ` · ${p.background_color}` : ""}` : "—",
    ],
    ["Quality", p.quality ?? "—"],
    ["Moderation", p.moderation ?? "—"],
    ["Reference fidelity", fidelityLabel(image)],
    [
      "System prompt",
      `${promptName(prompts, p.system_prompt_id)}${p.system_prompt_edited ? " (edited for this run)" : ""}`,
    ],
    [
      "Position prompt",
      `${promptName(prompts, p.position_prompt_id)}${p.position_prompt_edited ? " (edited for this run)" : ""}`,
    ],
    ["Logo sent", p.logo_sent == null ? "—" : p.logo_sent ? "yes" : "no"],
    ["Feet shift", p.feet_shift_px != null ? `${p.feet_shift_px}px` : "—"],
    ["Tokens", usageLabel(image.usage)],
    ["Created", new Date(image.created_at).toLocaleString()],
  ];

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-800">Image metadata</div>
        <a
          href={image.image_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-500 underline hover:text-zinc-800"
        >
          Open original
        </a>
      </div>
      <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-zinc-100 pb-1">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="min-w-0 truncate text-right text-zinc-800" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
