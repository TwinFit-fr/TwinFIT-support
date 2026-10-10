import OpenAI from "openai";
import {
  DEFAULT_GENERATION_PARAMS,
  KNOWN_IMAGE_MODELS,
  SHAPES,
  capabilitiesFor,
  resolveSize,
  validateGenerationParams,
} from "./capabilities";
import type { GenerationParams } from "./types";

export { DEFAULT_GENERATION_PARAMS };

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
      .filter((id) => id.includes("gpt-image") || id.includes("chatgpt-image"));
  } catch {
    discovered = [];
  }
  return [...new Set([...discovered, ...KNOWN_IMAGE_MODELS])].sort();
}

function applyOutputDirective(prompt: string, params: GenerationParams): string {
  const shape = SHAPES.find((item) => item.id === params.shape);
  const lines = ["OUTPUT SETTINGS:"];
  if (shape?.detail && shape.id !== "auto") {
    lines.push(`- Aspect ratio: ${shape.detail}.`);
  }
  if (params.quality !== "auto") {
    lines.push(`- Render quality: ${params.quality}.`);
  }
  lines.push(`- File format: ${params.format.toUpperCase()}.`);
  return `${prompt.trim()}\n\n${lines.join("\n")}`;
}

export type BuiltImageRequest = {
  model: string;
  prompt: string;
  size: string;
  quality: string;
  output_format: string;
  output_compression?: number;
  moderation: string;
  background?: string;
  mimeType: string;
};

export function buildImageRequest(prompt: string, params: GenerationParams): BuiltImageRequest {
  const issues = validateGenerationParams(params);
  if (issues.length) {
    throw new Error(`Invalid generation settings: ${issues.join(" ")}`);
  }
  const request: BuiltImageRequest = {
    model: params.model || DEFAULT_GENERATION_PARAMS.model,
    prompt: params.background === "auto" ? applyOutputDirective(prompt, params) : prompt.trim(),
    size: resolveSize(params),
    quality: params.quality,
    output_format: params.format,
    moderation: params.moderation,
    mimeType: MIME_BY_FORMAT[params.format] ?? "image/png",
  };
  if (params.format !== "png") {
    request.output_compression = params.compression;
  }
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
    moderation: request.moderation as "auto",
    ...(request.output_compression != null
      ? { output_compression: request.output_compression }
      : {}),
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

export async function editImage(
  prompt: string,
  params: GenerationParams,
  inputs: { bytes: Buffer; mimeType: string }[],
  options: {
    useFidelity?: boolean;
    /**
     * Also send the params' moderation. The SDK types only list it for generate, but the edit
     * endpoint accepts it; off by default so existing edits keep their requests.
     */
    moderation?: boolean;
  } = {},
): Promise<GeneratedImageResult> {
  const client = createOpenAIClient();
  const request = buildImageRequest(prompt, params);
  const files = inputs.map((input, i) => {
    const extension =
      input.mimeType === "image/jpeg" ? "jpg" : input.mimeType.split("/")[1] || "png";
    return new File([new Uint8Array(input.bytes)], `input_${i}.${extension}`, {
      type: input.mimeType,
    });
  });
  const response = await client.images.edit({
    model: request.model,
    image: files.length === 1 ? files[0] : files,
    prompt: request.prompt,
    size: request.size as "1024x1024",
    quality: request.quality as "auto",
    output_format: request.output_format as "png",
    ...(options.useFidelity && capabilitiesFor(params.model).inputFidelity
      ? { input_fidelity: params.input_fidelity as "high" }
      : {}),
    ...(request.output_compression != null
      ? { output_compression: request.output_compression }
      : {}),
    ...(request.background ? { background: request.background as "auto" } : {}),
    ...(options.moderation ? ({ moderation: request.moderation } as object) : {}),
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
