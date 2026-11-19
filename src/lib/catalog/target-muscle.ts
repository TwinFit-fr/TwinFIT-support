/** Shown when an exercise is saved without a target muscle. */
export const TARGET_MUSCLE_REQUIRED =
  "target muscle is required: pick one, or set the target of the pair (group + movement) in Taxonomy first";

/**
 * The exercise's target muscle code. `catalog.exercises.target_muscle_id` is NOT NULL, so an
 * exercise always needs one: the form fills it from the pair, and an empty value fails here with a
 * clear message instead of reaching Hasura as a null uuid.
 */
export function requireTargetMuscleCode(payload: { target_muscle_code?: unknown }): string {
  const code = String(payload.target_muscle_code ?? "").trim();
  if (!code) throw new Error(TARGET_MUSCLE_REQUIRED);
  return code;
}
