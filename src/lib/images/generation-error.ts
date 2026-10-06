import OpenAI from "openai";

/**
 * A generation that cannot succeed as asked (missing exercise, Start or base, two-frame Mid…).
 * Retrying it would fail the same way; `status` is the HTTP status it maps to.
 */
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

/**
 * Whether another attempt may succeed: OpenAI rate limits, server errors and lost connections,
 * and failures outside OpenAI (storage, GraphQL) are transient; a GenerationError or an OpenAI
 * rejection of the request itself (bad parameters, moderation) is not.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof GenerationError) return false;
  if (error instanceof OpenAI.APIConnectionError) return true;
  if (error instanceof OpenAI.APIError) {
    return error.status === undefined || error.status === 429 || error.status >= 500;
  }
  return true;
}

/** The message to store for a failed attempt, with OpenAI's cause when it has one. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = "cause" in error && error.cause instanceof Error ? error.cause.message : null;
    return cause && !error.message.includes(cause) ? `${error.message} (${cause})` : error.message;
  }
  return String(error || "Generation failed");
}
