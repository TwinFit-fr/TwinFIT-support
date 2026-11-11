/**
 * What the stage opens on when an exercise is picked: its saved pose clip in the editor, else an
 * instant draft. A clip that is not made of poses (motion capture, an uploaded file) cannot be
 * edited, so it plays instead.
 */

export type LandingVector = { id: string; status: string; format: string; active: boolean; avatar_id: string };

export type LandingPlan<V extends LandingVector = LandingVector> =
  /** The list of clips is still loading and one of them may be the exercise's. */
  | { kind: "wait" }
  /** Open this pose clip in the editor. */
  | { kind: "edit"; vector: V }
  /** This clip is the exercise's but cannot be edited as poses: it plays. */
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
}): LandingPlan<V> {
  if (input.readyCount === 0 && !input.vectors?.length) return { kind: "draft" };
  if (!input.vectors) return { kind: "wait" };
  const ready = input.vectors.filter((v) => v.status === "ready" && v.avatar_id === input.avatarId);
  const pick = ready.find((v) => v.id === input.preferredId) ?? ready.find((v) => v.active) ?? ready[0];
  if (!pick) return { kind: "draft" };
  return pick.format === "json" ? { kind: "edit", vector: pick } : { kind: "play", vector: pick };
}
