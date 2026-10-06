"use client";

import { Copy } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { capabilitiesFor, resolveSize } from "@/lib/images/capabilities";
import type {
  ExerciseImage,
  GenerationParams,
  ImagePrompt,
  MuscleMapImage,
  StyleReference,
} from "@/lib/images/types";
import { framePositionLabel } from "@/lib/images/types";

type Row = [label: string, value: string];

/** What every generated image records, exercise frame or muscle map. */
type GeneratedImage = Pick<ExerciseImage, "model" | "prompt" | "usage" | "created_at"> & {
  params: (Partial<GenerationParams> & { reference_ids?: string[] }) | null;
};

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
function fidelityLabel(image: GeneratedImage, hasInputImage: boolean): string {
  if (!image.params || !hasInputImage) return "—";
  if (!capabilitiesFor(image.model).inputFidelity) return "Not supported by model";
  return image.params.input_fidelity ?? "—";
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

/** Names of the library references sent with the image. */
function referencesLabel(ids: string[] | undefined, library: StyleReference[] | undefined): string {
  if (!ids?.length) return "—";
  return ids.map((id) => library?.find((r) => r.id === id)?.name ?? "deleted").join(", ");
}

/** Model and output settings, the same for every generated image. */
function outputRows(image: GeneratedImage, hasInputImage: boolean): Row[] {
  const p = image.params ?? {};
  const hasOutputParams = Boolean(p.model && p.shape && p.size);
  return [
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
    ["Fidelity", fidelityLabel(image, hasInputImage)],
  ];
}

/** The rows that have a value, then the exact prompt the model received. */
function MetadataList({ rows, prompt }: { rows: Row[]; prompt: string }) {
  const { success, error } = useToast();
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      success("Prompt copied");
    } catch {
      error("Could not copy the prompt");
    }
  }
  return (
    <div className="space-y-2 border-t border-zinc-100 pt-3 text-[11px]">
      <dl className="space-y-1">
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
      {prompt && (
        <details className="group rounded-md border border-zinc-200">
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-zinc-600 hover:text-zinc-900">
            <span className="font-medium">Prompt sent</span>
            <span className="text-zinc-400 group-open:hidden">Show</span>
          </summary>
          <div className="relative border-t border-zinc-100">
            <button
              type="button"
              onClick={() => void copyPrompt()}
              aria-label="Copy prompt"
              title="Copy prompt"
              className="absolute right-1.5 top-1.5 rounded bg-white/90 p-1 text-zinc-400 shadow-xs hover:text-zinc-900"
            >
              <Copy className="h-3 w-3" />
            </button>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-2 pr-8 font-mono text-[10.5px] leading-relaxed text-zinc-700">
              {prompt}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}

export function ImageMetadataPanel({
  image,
  prompts,
  references,
}: {
  image: ExerciseImage;
  prompts: ImagePrompt[] | undefined;
  /** The style's library, to name the references the image was made with. */
  references?: StyleReference[];
}) {
  const p = image.params ?? {};
  const rows: Row[] = [
    ["Method", generationMethod(image)],
    ...outputRows(image, Boolean(p.reference_file_id || p.guide_image_id)),
    [
      "System prompt",
      `${promptSlotLabel(prompts, p.system_prompt_id)}${p.system_prompt_edited ? " · edited" : ""}`,
    ],
    [
      "Position prompt",
      `${promptSlotLabel(prompts, p.position_prompt_id)}${p.position_prompt_edited ? " · edited" : ""}`,
    ],
    ["References", referencesLabel(p.reference_ids, references)],
    ["Logo", p.logo_sent == null ? "—" : p.logo_sent ? "Yes" : "No"],
    ["Feet shift", p.feet_shift_px != null ? `${p.feet_shift_px}px` : "—"],
    ["Tokens", usageLabel(image.usage)],
    ["Created", new Date(image.created_at).toLocaleString()],
  ];
  return <MetadataList rows={rows} prompt={image.prompt} />;
}

export function MuscleMapMetadataPanel({
  image,
  references,
}: {
  image: MuscleMapImage;
  /** The style's library, to name the references the map was made with. */
  references?: StyleReference[];
}) {
  const p = image.params ?? {};
  const rows: Row[] = [
    ["Method", p.base_file_id ? `Edit of the ${image.view} base` : "—"],
    ...outputRows(image, Boolean(p.base_file_id)),
    ["Prompt", p.prompt_id ? `Muscle map${p.prompt_edited ? " · edited" : ""}` : "—"],
    ["References", referencesLabel(p.reference_ids, references)],
    ["Tokens", usageLabel(image.usage)],
    ["Created", new Date(image.created_at).toLocaleString()],
  ];
  return <MetadataList rows={rows} prompt={image.prompt} />;
}
