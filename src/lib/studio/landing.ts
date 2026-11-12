/**
 * What the stage opens on when an exercise is picked: its saved pose clip in the editor, else an
 * instant draft. A motion capture plays instead: it opens in the editor as key poses only when
 * asked ("Edit as key poses"), since reading it takes a moment and its row stays as it is. A
 * .json clip found not to hold poses, or a file that did not load (clip-problems.ts), is not
 * opened again: it is shown as it is, with the problem in words, instead of a silent template.
 */

export type LandingVector = { id: string; status: string; format: string; active: boolean; avatar_id: string };

export type LandingPlan<V extends LandingVector = LandingVector> =
  /** The list of clips is still loading and one of them may be the exercise's. */
  | { kind: "wait" }
  /** Open this pose clip in the editor. */
  | { kind: "edit"; vector: V }
  /** This clip is the exercise's and is a capture, or cannot be edited: it plays (a capture can be made key poses on request). */
  | { kind: "play"; vector: V }
  /** Nothing saved for this avatar: open the instant draft. */
  | { kind: "draft" };

export function landingPlan<V extends LandingVector>(input: {
  /** Ready clips of the exercise according to the catalog (any avatar): 0 means no need to wait for the list. */
  readyCount: number;
  /** The exercise's clips, or null while they load. */
  vectors: V[] | null;
  avatarId: string;
  /** The clip the user chose last (reopened after a revert), when it is still there. */
  preferredId: string | null;
  /** Clips already found unusable as poses (not poses, or not readable), by id. */
  problems?: Readonly<Record<string, unknown>>;
}): LandingPlan<V> {
  if (input.readyCount === 0 && !input.vectors?.length) return { kind: "draft" };
  if (!input.vectors) return { kind: "wait" };
  const ready = input.vectors.filter((v) => v.status === "ready" && v.avatar_id === input.avatarId);
  const pick = ready.find((v) => v.id === input.preferredId) ?? ready.find((v) => v.active) ?? ready[0];
  if (!pick) return { kind: "draft" };
  return pick.format === "json" && !input.problems?.[pick.id] ? { kind: "edit", vector: pick } : { kind: "play", vector: pick };
}
