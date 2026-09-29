import type { GenerationParams } from "./types";

// OpenAI does not expose per-model capabilities via API; values from the Images API
// reference (openai SDK 6.49 types) and developers.openai.com image-generation guide.

export type ModelCapabilities = {
  family: "gpt-image-1" | "gpt-image-2" | "gpt-image-2.5";
  customSize: boolean;
  transparent: boolean;
  inputFidelity: boolean;
  qualities: readonly string[];
};

const BASE_QUALITIES = ["auto", "low", "medium", "high"] as const;

const FAMILIES: Record<ModelCapabilities["family"], ModelCapabilities> = {
  "gpt-image-1": {
    family: "gpt-image-1",
    customSize: false,
    transparent: true,
    inputFidelity: true,
    qualities: BASE_QUALITIES,
  },
  "gpt-image-2": {
    family: "gpt-image-2",
    customSize: true,
    transparent: false,
    inputFidelity: false,
    qualities: BASE_QUALITIES,
  },
  "gpt-image-2.5": {
    family: "gpt-image-2.5",
    customSize: true,
    transparent: true,
    inputFidelity: false,
    qualities: [...BASE_QUALITIES, "xhigh", "max"],
  },
};

export function capabilitiesFor(model: string): ModelCapabilities {
  if (model.startsWith("gpt-image-2.5")) return FAMILIES["gpt-image-2.5"];
  if (model.startsWith("gpt-image-2")) return FAMILIES["gpt-image-2"];
  // input_fidelity: only confirmed for gpt-image-1 / gpt-image-1.5 (the API rejects it on 2.5).
  const fidelity = model === "gpt-image-1" || model.startsWith("gpt-image-1.5");
  return { ...FAMILIES["gpt-image-1"], inputFidelity: fidelity };
}

export const KNOWN_IMAGE_MODELS = [
  "chatgpt-image-latest",
  "gpt-image-1",
  "gpt-image-1-mini",
  "gpt-image-1.5",
  "gpt-image-2",
  "gpt-image-2-2026-04-21",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-flare-2026-09-08",
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-sunburst-2026-09-08",
] as const;

export const SHAPES = [
  { id: "square", label: "Square", detail: "1:1", ratio: 1, fixedSize: "1024x1024" },
  { id: "landscape", label: "Landscape", detail: "3:2", ratio: 3 / 2, fixedSize: "1536x1024" },
  { id: "portrait", label: "Portrait", detail: "2:3", ratio: 2 / 3, fixedSize: "1024x1536" },
  { id: "classic", label: "Classic", detail: "4:3", ratio: 4 / 3, fixedSize: null },
  { id: "wide", label: "Wide", detail: "16:9", ratio: 16 / 9, fixedSize: null },
  { id: "story", label: "Story", detail: "9:16", ratio: 9 / 16, fixedSize: null },
  { id: "auto", label: "Auto", detail: "Model", ratio: null, fixedSize: "auto" },
] as const;

export const SIZE_TIERS = [
  { id: "1K", label: "1K", pixels: 1024 * 1024 },
  { id: "2K", label: "2K", pixels: 2048 * 2048 },
  { id: "4K", label: "4K", pixels: 3840 * 2160 },
] as const;

export const BACKGROUNDS = [
  { id: "auto", label: "From prompt" },
  { id: "opaque", label: "Opaque" },
  { id: "transparent", label: "Transparent" },
] as const;

export const FORMATS = [
  { id: "png", label: "PNG" },
  { id: "webp", label: "WebP" },
  { id: "jpeg", label: "JPEG" },
] as const;

export const QUALITIES = [
  { id: "auto", label: "Auto" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra high" },
  { id: "max", label: "Max" },
] as const;

export const INPUT_FIDELITIES = [
  { id: "high", label: "High" },
  { id: "low", label: "Low" },
] as const;

export const SUBJECT_OPTIONS = [
  { id: "random", label: "Random" },
  { id: "man", label: "Man" },
  { id: "woman", label: "Woman" },
] as const;

export const MAX_CONCURRENCY_LIMIT = 6;

export const MODERATIONS = [
  { id: "auto", label: "Auto" },
  { id: "low", label: "Low" },
] as const;

const MAX_EDGE = 3840;
const MIN_PIXELS = 655_360;
const MAX_PIXELS = 8_294_400;

export const DEFAULT_GENERATION_PARAMS: GenerationParams = {
  model: "gpt-image-1",
  shape: "square",
  size: "1K",
  background: "auto",
  format: "png",
  quality: "auto",
  compression: 100,
  moderation: "auto",
  background_color: "#F2E4CE",
  input_fidelity: "high",
  max_concurrency: 3,
};

function roundTo16(value: number): number {
  return Math.max(16, Math.round(value / 16) * 16);
}

function customSize(ratio: number, targetPixels: number): string {
  const pixels = Math.min(Math.max(targetPixels, MIN_PIXELS), MAX_PIXELS);
  let width = roundTo16(Math.sqrt(pixels * ratio));
  let height = roundTo16(Math.sqrt(pixels / ratio));
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  width = roundTo16(width * scale);
  height = roundTo16(height * scale);
  while (width * height > MAX_PIXELS) {
    width -= 16;
    height = roundTo16(width / ratio);
  }
  return `${width}x${height}`;
}

export function resolveSize(params: Pick<GenerationParams, "model" | "shape" | "size">): string {
  const shape = SHAPES.find((s) => s.id === params.shape) ?? SHAPES[0];
  if (shape.ratio == null) return "auto";
  if (!capabilitiesFor(params.model).customSize) {
    return shape.fixedSize ?? "1024x1024";
  }
  const tier = SIZE_TIERS.find((t) => t.id === params.size) ?? SIZE_TIERS[0];
  return customSize(shape.ratio, tier.pixels);
}

export function isShapeSupported(model: string, shapeId: string): boolean {
  const shape = SHAPES.find((s) => s.id === shapeId);
  if (!shape) return false;
  return capabilitiesFor(model).customSize || shape.fixedSize != null;
}

/** Returns human-readable reasons why these params cannot be sent to OpenAI. */
export function validateGenerationParams(params: GenerationParams): string[] {
  const caps = capabilitiesFor(params.model);
  const issues: string[] = [];
  if (!isShapeSupported(params.model, params.shape)) {
    issues.push(`Shape "${params.shape}" needs a model with custom sizes (gpt-image-2 or newer).`);
  }
  if (params.background === "transparent" && !caps.transparent) {
    issues.push(`${params.model} does not support transparent backgrounds.`);
  }
  if (params.background === "transparent" && params.format === "jpeg") {
    issues.push("Transparent background requires PNG or WebP.");
  }
  if (!caps.qualities.includes(params.quality)) {
    issues.push(`Quality "${params.quality}" is not available for ${params.model}.`);
  }
  if (!Number.isInteger(params.compression) || params.compression < 0 || params.compression > 100) {
    issues.push("Compression must be an integer between 0 and 100.");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(params.background_color)) {
    issues.push("Background color must be a hex color like #F2E4CE.");
  }
  if (!INPUT_FIDELITIES.some((f) => f.id === params.input_fidelity)) {
    issues.push("Reference fidelity must be high or low.");
  }
  if (
    !Number.isInteger(params.max_concurrency) ||
    params.max_concurrency < 1 ||
    params.max_concurrency > MAX_CONCURRENCY_LIMIT
  ) {
    issues.push(`Concurrent requests must be between 1 and ${MAX_CONCURRENCY_LIMIT}.`);
  }
  return issues;
}
