import OpenAI from "openai";
import type { GenerationParams } from "./types";

const SHAPE_TO_SIZE: Record<string, string> = {
  square: "1024x1024",
  landscape: "1536x1024",
  portrait: "1024x1536",
  classic: "1536x1024",
  wide: "1536x1024",
  story: "1024x1536",
  auto: "auto",
};

const SIZE_MULTIPLIER: Record<string, number> = {
  "1K": 1,
  "2K": 2,
  "4K": 4,
};

export const FALLBACK_IMAGE_MODELS = [
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

export const GENERATION_PRESETS = {
  shapes: [
    { id: "square", label: "Square", detail: "1:1" },
    { id: "landscape", label: "Landscape", detail: "3:2" },
    { id: "portrait", label: "Portrait", detail: "2:3" },
    { id: "classic", label: "Classic", detail: "4:3" },
    { id: "wide", label: "Wide", detail: "16:9" },
    { id: "story", label: "Story", detail: "9:16" },
    { id: "auto", label: "Auto", detail: "Model" },
  ],
  sizes: [
    { id: "1K", label: "1K" },
    { id: "2K", label: "2K" },
    { id: "4K", label: "4K" },
  ],
  backgrounds: [
    { id: "auto", label: "From prompt" },
    { id: "opaque", label: "Opaque" },
    { id: "transparent", label: "Transparent" },
  ],
  formats: [
    { id: "png", label: "PNG" },
    { id: "webp", label: "WebP" },
    { id: "jpeg", label: "JPEG" },
  ],
  qualities: [
    { id: "auto", label: "Auto" },
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium" },
    { id: "high", label: "High" },
    { id: "xhigh", label: "Extra high" },
    { id: "max", label: "Max" },
  ],
} as const;

export const DEFAULT_GENERATION_PARAMS: GenerationParams = {
  model: "gpt-image-1",
  shape: "square",
  size: "1K",
  background: "auto",
  format: "png",
  quality: "auto",
};

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
};

export function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}

export async function listImageModelIds(client?: OpenAI): Promise<string[]> {
  const openai = client ?? createOpenAIClient();
  let discovered: string[] = [];
  try {
    const page = await openai.models.list();
    discovered = page.data
      .map((model) => model.id)
      .filter(
        (id) =>
          id.includes("gpt-image") ||
          id.includes("chatgpt-image") ||
          id.startsWith("dall-e"),
      );
  } catch {
    discovered = [];
  }
  return [...new Set([...discovered, ...FALLBACK_IMAGE_MODELS])].sort();
}

function scaleSize(base: string, sizeTier: string): string {
  const [widthText, heightText] = base.split("x");
  const multiplier = SIZE_MULTIPLIER[sizeTier] ?? 1;
  let width = Math.min(Number(widthText) * multiplier, 3840);
  let height = Math.min(Number(heightText) * multiplier, 3840);
  width -= width % 16;
  height -= height % 16;
  return `${width}x${height}`;
}

function resolveOutputFormat(params: GenerationParams): string {
  if (params.background === "transparent" && params.format === "jpeg") {
    return "png";
  }
  return params.format;
}

function resolveQuality(params: GenerationParams): string {
  if (
    (params.quality === "xhigh" || params.quality === "max") &&
    !params.model.startsWith("gpt-image-2.5")
  ) {
    return "high";
  }
  return params.quality;
}

function resolveSize(params: GenerationParams): string {
  const base = SHAPE_TO_SIZE[params.shape] ?? "1024x1024";
  if (base === "auto") return "auto";
  if (params.model.startsWith("gpt-image-2")) {
    return scaleSize(base, params.size);
  }
  return base;
}

function applyOutputDirective(prompt: string, params: GenerationParams): string {
  const shape = GENERATION_PRESETS.shapes.find((item) => item.id === params.shape);
  const lines = ["OUTPUT SETTINGS:"];
  if (shape?.detail && shape.id !== "auto") {
    lines.push(`- Aspect ratio: ${shape.detail}.`);
  }
  if (params.background === "transparent") {
    lines.push(
      "- Background: fully transparent alpha. No fill, floor, shadow plate, or environment.",
    );
  } else if (params.background === "opaque") {
    lines.push("- Background: fully opaque. No transparency.");
  }
  if (params.quality !== "auto") {
    lines.push(`- Render quality: ${params.quality}.`);
  }
  lines.push(`- File format: ${resolveOutputFormat(params).toUpperCase()}.`);
  return `${prompt.trim()}\n\n${lines.join("\n")}`;
}

export type BuiltImageRequest = {
  model: string;
  prompt: string;
  size: string;
  quality: string;
  output_format: string;
  background?: string;
  mimeType: string;
};

export function buildImageRequest(
  prompt: string,
  params: GenerationParams,
): BuiltImageRequest {
  const outputFormat = resolveOutputFormat(params);
  const request: BuiltImageRequest = {
    model: params.model || DEFAULT_GENERATION_PARAMS.model,
    prompt:
      params.background === "auto"
        ? applyOutputDirective(prompt, params)
        : prompt.trim(),
    size: resolveSize(params),
    quality: resolveQuality(params),
    output_format: outputFormat,
    mimeType: MIME_BY_FORMAT[outputFormat] ?? "image/png",
  };
  if (params.background !== "auto") {
    request.background = params.background;
  }
  return request;
}

export type GeneratedImageResult = {
  bytes: Buffer;
  mimeType: string;
  usage: Record<string, unknown> | null;
};

export async function generateImage(
  prompt: string,
  params: GenerationParams,
): Promise<GeneratedImageResult> {
  const client = createOpenAIClient();
  const request = buildImageRequest(prompt, params);
  const response = await client.images.generate({
    model: request.model,
    prompt: request.prompt,
    size: request.size as "1024x1024",
    quality: request.quality as "auto",
    output_format: request.output_format as "png",
    ...(request.background ? { background: request.background as "auto" } : {}),
  });
  const first = response.data?.[0];
  if (!first?.b64_json) {
    throw new Error("OpenAI image response did not include b64_json");
  }
  return {
    bytes: Buffer.from(first.b64_json, "base64"),
    mimeType: request.mimeType,
    usage: (response.usage as unknown as Record<string, unknown>) ?? null,
  };
}

export async function refineImage(
  prompt: string,
  params: GenerationParams,
  sourceBytes: Buffer,
  sourceMimeType: string,
): Promise<GeneratedImageResult> {
  const client = createOpenAIClient();
  const request = buildImageRequest(prompt, params);
  const extension = request.output_format === "jpeg" ? "jpg" : request.output_format;
  const file = new File([new Uint8Array(sourceBytes)], `source.${extension}`, {
    type: sourceMimeType,
  });
  const response = await client.images.edit({
    model: request.model,
    image: file,
    prompt: request.prompt,
    size: request.size as "1024x1024",
    quality: request.quality as "auto",
    ...(request.background ? { background: request.background as "auto" } : {}),
  });
  const first = response.data?.[0];
  if (!first?.b64_json) {
    throw new Error("OpenAI image edit response did not include b64_json");
  }
  return {
    bytes: Buffer.from(first.b64_json, "base64"),
    mimeType: request.mimeType,
    usage: (response.usage as unknown as Record<string, unknown>) ?? null,
  };
}
