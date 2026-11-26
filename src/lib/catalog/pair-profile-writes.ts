import { gql } from "@/lib/gql";
import { staffGql } from "@/lib/staff-gql";
import { pickerRows, requirePair } from "./lookups";
import type { LookupRef } from "./lookup-find";
import { normalizeMuscleCode, normalizeTaxonomy } from "./normalize";
import { cleanSecondaries, profileInputError } from "./pair-profiles";

export type PairTargetProfilePayload = {
  muscle_group_code?: unknown;
  movement_type_code?: unknown;
  target_muscle_code?: unknown;
  secondary_muscle_codes?: unknown;
  reason?: unknown;
};

type MuscleRow = LookupRef & { home_muscle_group?: { code: string } | null };

/**
 * Creates or edits the (pair, target) profile of a pair (1790000000107): the target, its ordered
 * secondaries and the reason, in one mutation, with the group's picker rows for secondaries of
 * another home. The database rewrites the copies of the inherited exercises that resolve through
 * the profile. A profile's target never changes (it is part of its key): delete it and create
 * another.
 */
export async function setPairTargetProfile(token: string, payload: PairTargetProfilePayload) {
  const pair = await requirePair(token, payload.muscle_group_code, payload.movement_type_code);
  const groupCode = normalizeTaxonomy(payload.muscle_group_code);
  const target = normalizeMuscleCode(payload.target_muscle_code);
  const secondary = cleanSecondaries(
    target,
    (Array.isArray(payload.secondary_muscle_codes) ? payload.secondary_muscle_codes : []).map(normalizeMuscleCode),
  );
  const codes = [...new Set([target, ...secondary].filter(Boolean))];
  const found = await staffGql<{
    catalog_muscles: MuscleRow[];
    pair: { target_muscle?: { code: string } | null } | null;
  }>(
    token,
    gql`query SupportTaxonomyProfileContext($codes: [String!]!, $g: uuid!, $m: uuid!) {
      catalog_muscles(where: { code: { _in: $codes } }) { id code home_muscle_group { code } }
      pair: catalog_muscle_group_movement_types_by_pk(muscle_group_id: $g, movement_type_id: $m) {
        target_muscle { code }
      }
    }`,
    { codes, g: pair.muscle_group_id, m: pair.movement_type_id },
  );
  const byCode = new Map(found.catalog_muscles.map((row) => [row.code, row]));
  const unknown = codes.filter((code) => !byCode.has(code));
  if (unknown.length) throw new Error(`Unknown muscle code: ${unknown.join(", ")}`);
  const error = profileInputError(
    {
      groupCode,
      pairTarget: found.pair?.target_muscle?.code ?? null,
      target,
      secondary,
      reason: payload.reason,
    },
    byCode.get(target)?.home_muscle_group?.code ?? null,
  );
  if (error) throw new Error(error);

  const targetId = byCode.get(target)!.id;
  const secondaryRows = secondary.map((code) => byCode.get(code)!);
  const key = { ...pair, target_muscle_id: targetId };
  await staffGql(
    token,
    gql`mutation SupportTaxonomySetPairTargetProfile(
      $profile: catalog_pair_target_profiles_insert_input!
      $g: uuid!
      $m: uuid!
      $t: uuid!
      $keep: [uuid!]!
      $secondary: [catalog_pair_target_profile_secondary_muscles_insert_input!]!
      $pickers: [catalog_muscle_group_muscles_insert_input!]!
    ) {
      insert_catalog_pair_target_profiles_one(
        object: $profile
        on_conflict: { constraint: pair_target_profiles_pkey, update_columns: [reason] }
      ) { target_muscle_id }
      delete_catalog_pair_target_profile_secondary_muscles(
        where: {
          muscle_group_id: { _eq: $g }
          movement_type_id: { _eq: $m }
          target_muscle_id: { _eq: $t }
          muscle_id: { _nin: $keep }
        }
      ) { affected_rows }
      insert_catalog_pair_target_profile_secondary_muscles(
        objects: $secondary
        on_conflict: { constraint: pair_target_profile_secondary_muscles_pkey, update_columns: [sort_order] }
      ) { affected_rows }
      insert_catalog_muscle_group_muscles(
        objects: $pickers
        on_conflict: { constraint: muscle_group_muscles_pkey, update_columns: [] }
      ) { affected_rows }
    }`,
    {
      profile: { ...key, reason: String(payload.reason).trim() },
      g: pair.muscle_group_id,
      m: pair.movement_type_id,
      t: targetId,
      keep: secondaryRows.map((row) => row.id),
      secondary: secondaryRows.map((row, sort_order) => ({ ...key, muscle_id: row.id, sort_order })),
      pickers: pickerRows(pair.muscle_group_id, groupCode, secondaryRows),
    },
  );
}

/**
 * Deletes a (pair, target) profile and its secondaries. The database refuses it while an
 * inherited exercise resolves through it (`target_profiles_in_use_guard`).
 */
export async function deletePairTargetProfile(token: string, payload: PairTargetProfilePayload) {
  const pair = await requirePair(token, payload.muscle_group_code, payload.movement_type_code);
  const target = normalizeMuscleCode(payload.target_muscle_code);
  if (!target) throw new Error("A target profile needs a target muscle");
  const found = await staffGql<{ catalog_muscles: LookupRef[] }>(
    token,
    gql`query SupportTaxonomyMuscleByCode($code: String!) {
      catalog_muscles(where: { code: { _eq: $code } }, limit: 1) { id code }
    }`,
    { code: target },
  );
  const muscle = found.catalog_muscles[0];
  if (!muscle) throw new Error(`Unknown muscle code: ${target}`);
  const deleted = await staffGql<{ delete_catalog_pair_target_profiles_by_pk: unknown }>(
    token,
    gql`mutation SupportTaxonomyDeletePairTargetProfile($g: uuid!, $m: uuid!, $t: uuid!) {
      delete_catalog_pair_target_profiles_by_pk(
        muscle_group_id: $g
        movement_type_id: $m
        target_muscle_id: $t
      ) { target_muscle_id }
    }`,
    { g: pair.muscle_group_id, m: pair.movement_type_id, t: muscle.id },
  );
  if (!deleted.delete_catalog_pair_target_profiles_by_pk) {
    throw new Error(`The pair has no target profile for ${target}`);
  }
}
