"use client";

import { capabilitiesFor, resolveSize } from "@/lib/images/capabilities";
import type { ExerciseImage, GenerationParams, ImagePrompt } from "@/lib/images/types";
import { framePositionLabel } from "@/lib/images/types";

function generationMethod(image: ExerciseImage): string {
  const p = image.params;
  if (!p) return "—";
  // Strips are no longer generated; older images keep showing how they were made.
  if (p.sequence)
    return `${p.sequence.cuts.length + 1}-pose strip ${p.sequence.strip_size} (cuts at ${p.sequence.cuts.join(" / ")})`;
  if (p.frame_align) return "Frame alignment";
  if (p.manual_overlay) return "Manual overlay";
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

function promptSlotLabel(
  prompts: ImagePrompt[] | undefined,
  id: string | null | undefined,
): string {
  if (!id) return "—";
  const prompt = prompts?.find((p) => p.id === id);
  if (!prompt) return "deleted prompt";
  if (prompt.kind === "system") return "System";
  if (prompt.kind === "support") return "Support";
  if (prompt.kind === "position") return framePositionLabel(prompt.position);
  return "Prompt";
}

export function ImageMetadataPanel({
  image,
  prompts,
}: {
  image: ExerciseImage;
  prompts: ImagePrompt[] | undefined;
}) {
  const p = image.params ?? {};
  const hasOutputParams = Boolean(p.model && p.shape && p.size);
  const rows: [string, string][] = [
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
    ["Fidelity", fidelityLabel(image)],
    [
      "System prompt",
      `${promptSlotLabel(prompts, p.system_prompt_id)}${p.system_prompt_edited ? " · edited" : ""}`,
    ],
    [
      "Position prompt",
      `${promptSlotLabel(prompts, p.position_prompt_id)}${p.position_prompt_edited ? " · edited" : ""}`,
    ],
    ["Logo", p.logo_sent == null ? "—" : p.logo_sent ? "Yes" : "No"],
    ["Feet shift", p.feet_shift_px != null ? `${p.feet_shift_px}px` : "—"],
    ["Tokens", usageLabel(image.usage)],
    ["Created", new Date(image.created_at).toLocaleString()],
  ];

  return (
    <dl className="space-y-1 border-t border-zinc-100 pt-3 text-[11px]">
      {rows
        .filter(([, value]) => value !== "—")
        .map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="shrink-0 text-zinc-400">{label}</dt>
            <dd className="min-w-0 truncate text-right text-zinc-700" title={value}>
              {value}
            </dd>
          </div>
        ))}
    </dl>
  );
}
