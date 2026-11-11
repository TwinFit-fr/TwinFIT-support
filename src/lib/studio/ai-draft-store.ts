"use client";

import { create } from "zustand";
import type { AiRequest } from "./ai-draft-request.ts";
import type { AiReplacement } from "./ai-draft-result.ts";

/** An answer that would replace work made by hand: it waits for Apply or Dismiss. */
export type AiSuggestion = { request: AiRequest; next: AiReplacement; summary: string };

/**
 * The AI draft in flight, its last failure and a waiting suggestion, next to the pose document so
 * any control (the settings group, the editor header, the stage) can show them and cancel. The
 * request itself runs in use-ai-draft.ts.
 */
type AiDraftState = {
  pending: AiRequest | null;
  /** The newest request sent: an older answer is discarded. */
  latestId: number | null;
  suggestion: AiSuggestion | null;
  failure: { request: AiRequest; message: string } | null;
  /** The latest answer was applied directly (for the editor to say so once). */
  landed: { requestId: number; at: number } | null;
};

export const useAiDraftStore = create<AiDraftState>(() => ({ pending: null, latestId: null, suggestion: null, failure: null, landed: null }));
