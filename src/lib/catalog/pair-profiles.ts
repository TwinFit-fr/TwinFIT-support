/**
 * Rules of the pair editor (Taxonomy → Group movements) and of the anatomy links, as pure
 * functions shared by the panel and the API: target profiles of a pair (backend 2.10.0,
 * migration 1790000000107), the picker rows of a group (1790000000110) and the home of a muscle
 * (1790000000103). The database stays the authority; these checks give staff the reason before
 * it refuses.
 */

export const PROFILE_REASON_REQUIRED =
  "A target profile needs a reason: write why exercises with this target use other secondaries";

/** A (pair, target) profile as the taxonomy query returns it, by codes. */
export type ProfileRef = { target: string; secondary: string[]; reason?: string | null };

/** An exercise of a pair as the taxonomy query returns it. */
export type PairExerciseRef = { muscles_inherited: boolean; target_muscle?: { code: string } | null };

/**
 * Targets the pair itself may take: its group's home muscles, without the targets it has a
 * profile for (the database refuses those: `pair_00_target_not_profiled`). The current target
 * stays in the list.
 */
export function pairTargetCodes(homeCodes: string[], profiles: ProfileRef[], current = ""): string[] {
  const profiled = new Set(profiles.map((p) => p.target));
  return homeCodes.filter((code) => code === current || !profiled.has(code));
}

/**
 * Targets a new profile may take: the group's home muscles other than the pair's target and the
 * targets that already have a profile.
 */
export function profileTargetCodes(homeCodes: string[], pairTarget: string, profiles: ProfileRef[]): string[] {
  const taken = new Set([pairTarget, ...profiles.map((p) => p.target)]);
  return homeCodes.filter((code) => !taken.has(code));
}

/** How many inherited exercises of the pair resolve their muscles through the profile of `target`. */
export function profileUserCount(exercises: PairExerciseRef[] | undefined, target: string): number {
  return (exercises ?? []).filter((e) => e.muscles_inherited && e.target_muscle?.code === target).length;
}

export type ProfileInput = {
  groupCode: string;
  pairTarget: string | null;
  target: string;
  secondary: string[];
  reason: unknown;
};

/** The secondaries in order, without blanks, repeats or the target itself. */
export function cleanSecondaries(target: string, secondary: unknown[]): string[] {
  const out: string[] = [];
  for (const raw of secondary) {
    const code = String(raw ?? "").trim();
    if (code && code !== target && !out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * Why a profile cannot be saved, null when it can. `targetHome` is the home group of the target
 * muscle (null: none). Mirrors `target_profiles_00_check` and the reason check.
 */
export function profileInputError(x: ProfileInput, targetHome: string | null): string | null {
  if (!x.target) return "A target profile needs a target muscle";
  if (x.pairTarget && x.target === x.pairTarget) {
    return `${x.target} is the pair's own target: a profile is for another target of the pair`;
  }
  if (targetHome !== x.groupCode) {
    return `Target muscle ${x.target} belongs to ${targetHome ? `group ${targetHome}` : "no group"}, not ${x.groupCode}: a profile's target must be one of ${x.groupCode}'s own muscles`;
  }
  if (String(x.reason ?? "").trim() === "") return PROFILE_REASON_REQUIRED;
  return null;
}

/** A muscle by code with its home group, as the API resolves the codes it is sent. */
export type MuscleHomeRef = { id: string; code: string; home?: string | null };

/**
 * The picker rows a group needs for these secondaries: since 1790000000110 a group's
 * `muscle_group_muscles` rows of role `secondary` list exactly the muscles of another home that
 * its pairs, profiles and exercises use as secondaries. Muscles homed in the group need none
 * (their row is the `target` one).
 */
export function pickerRowMuscles(groupCode: string, secondaries: MuscleHomeRef[]): MuscleHomeRef[] {
  return secondaries.filter((m) => m.home !== groupCode);
}

/**
 * Why a change of a muscle's link to its home group is refused: removing the home row, or turning
 * it into a secondary, would leave an active muscle without a home (constraint trigger
 * `muscles_home_kept`, checked at commit). It moves only by linking it as target of another group.
 */
export function homeLinkBlocker(
  muscle: { code: string; active?: boolean | null; home?: string | null },
  groupCode: string,
  change: "unlink" | "secondary",
): string | null {
  if (muscle.active === false || muscle.home !== groupCode) return null;
  const what = change === "unlink" ? "unlinked from" : "made a secondary of";
  return `${muscle.code} cannot be ${what} ${groupCode}, its home: an active muscle always has a home group. Link it as target of another group (that moves it), or deactivate it`;
}
