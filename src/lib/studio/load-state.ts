/**
 * What each data source of the Studio has to say right now: still loading, failed, answered with
 * nothing, or answered with something. A source that has data keeps showing it when a later
 * refresh fails (the data is still the best answer); a source without data that failed says so
 * instead of looking empty. Pure functions only, so the panes can trust one rule.
 */

export type LoadState = "loading" | "failed" | "empty" | "ready";

export function loadState<T>(source: { data: T | undefined; error?: unknown }, isEmpty: (data: T) => boolean): LoadState {
  if (source.data !== undefined) return isEmpty(source.data) ? "empty" : "ready";
  return source.error ? "failed" : "loading";
}

/** The source has answered (with or without rows). */
export function isSettled(state: LoadState): boolean {
  return state === "empty" || state === "ready";
}

/** A short, plain reason for a failed request, or null when the error says nothing useful. */
export function failureReason(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const text = raw.trim();
  if (!text) return null;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(text)) return "The server could not be reached.";
  if (/not authenticated|jwt|unauthori[sz]ed|\b401\b/i.test(text)) return "Your session has expired. Sign in again.";
  if (/\b5\d\d\b/.test(text) && /request failed/i.test(text)) return "The server had a problem answering.";
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export type AvatarLike = { status: string; name: string; progress?: number | null };

/** What the stage can show before it has an avatar to draw. */
export type StageState =
  | { kind: "loading" }
  | { kind: "failed" }
  /** The list answered and no avatar can be drawn: first run. */
  | { kind: "no-avatar" }
  /** No avatar is ready yet, one is being built (a Meshy job). */
  | { kind: "building"; name: string; progress: number }
  | { kind: "ready" };

export function stageState(avatars: LoadState, list: readonly AvatarLike[]): StageState {
  if (avatars === "loading") return { kind: "loading" };
  if (avatars === "failed") return { kind: "failed" };
  if (list.some((a) => a.status === "ready")) return { kind: "ready" };
  const building = list.find((a) => a.status === "pending" || a.status === "processing");
  if (building) {
    const progress = Number(building.progress);
    return { kind: "building", name: building.name, progress: Number.isFinite(progress) ? Math.min(100, Math.max(0, Math.round(progress))) : 0 };
  }
  return { kind: "no-avatar" };
}

/**
 * What the side panel's guide puts first while nothing is open, and whether the stage invites
 * the user to pick an exercise. An avatar problem comes first (nothing can be shown without one),
 * then a catalog problem (nothing can be picked), then loading; only a workspace with both
 * answers in says "Pick an exercise · Start here".
 */
export type GuideFocus =
  | { kind: "pick" }
  | { kind: "loading" }
  | { kind: "avatars-failed" }
  | { kind: "no-avatar" }
  | { kind: "building"; name: string; progress: number }
  | { kind: "catalog-failed" }
  | { kind: "catalog-empty" };

/** A guide focus that is not "pick": something to do or wait for first. */
export type StatusFocus = Exclude<GuideFocus, { kind: "pick" }>;

/** The note for a stage that cannot draw an avatar (null when it can, or while the list loads). */
export function stageNote(stage: StageState): StatusFocus | null {
  if (stage.kind === "failed") return { kind: "avatars-failed" };
  if (stage.kind === "no-avatar") return { kind: "no-avatar" };
  if (stage.kind === "building") return stage;
  return null;
}

export function guideFocus(catalog: LoadState, stage: StageState): GuideFocus {
  const note = stageNote(stage);
  if (note) return note;
  if (catalog === "failed") return { kind: "catalog-failed" };
  if (catalog === "empty") return { kind: "catalog-empty" };
  if (catalog === "loading" || stage.kind === "loading") return { kind: "loading" };
  return { kind: "pick" };
}

/** Editing needs an avatar on the stage: a pose draft is not shown while the stage cannot draw one. */
export function stageBlocksEditing(stage: StageState): boolean {
  return stage.kind !== "ready";
}

/** Developer readouts on the stage (render counters) show only with ?debug=1 (or true / on). */
export function debugEnabled(search: string): boolean {
  const value = new URLSearchParams(search).get("debug");
  return value !== null && /^(1|true|on|yes)$/i.test(value.trim());
}
