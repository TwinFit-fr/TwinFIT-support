/**
 * An AI draft request and where its answer may land. A request is tied to the exercise, the avatar
 * and the opened draft it was started from (the editor's `editId`): an answer for a draft that is
 * no longer open is thrown away, never applied to another exercise. On the draft it was asked for,
 * the answer is applied at once, unless the poses hold work made by hand; then it waits as a
 * suggestion the user applies or dismisses. Pure.
 */

export type DraftIdentity = { exerciseId: string; avatarId: string; editId: number };

export type AiRequest = DraftIdentity & {
  /** Increasing per request: a newer request replaces an older one. */
  id: number;
  instructions: string;
  /** Date.now() when it was sent. */
  startedAt: number;
};

export type AiFate = "apply" | "suggest" | "discard";

export function sameDraft(a: DraftIdentity | null | undefined, b: DraftIdentity | null | undefined): boolean {
  return Boolean(a && b && a.exerciseId === b.exerciseId && a.avatarId === b.avatarId && a.editId === b.editId);
}

/**
 * What to do with an answer: discard it when it is not the latest request or its draft is no longer
 * open; offer it when applying it would replace work made by hand; else apply it.
 */
export function aiFate(request: AiRequest, latestId: number | null, now: DraftIdentity | null, handMade: boolean): AiFate {
  if (latestId !== request.id || !sameDraft(request, now)) return "discard";
  return handMade ? "suggest" : "apply";
}

/** "8 s" while it runs, for the editor and the stage. */
export function elapsedLabel(startedAt: number, now: number): string {
  return `${Math.max(0, Math.floor((now - startedAt) / 1000))} s`;
}
