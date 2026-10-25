import { staffGql } from "@/lib/staff-gql";

/**
 * Active exercises with their resolved muscles (pair's when inherited, own when custom), for
 * the exercise preview on the muscle map page.
 */

export type PilotExercise = {
  exo_id: number;
  display_name: string;
  muscles_inherited: boolean;
  primary_muscle_group_id: string;
  primary_muscle_group: { code: string };
  movement_type: { code: string };
  resolved_muscles: Array<{
    muscle_id: string;
    role: "target" | "secondary";
    sort_order: number;
    muscle: { code: string; name: string };
  }>;
};

export type PilotData = { exercises: PilotExercise[] };

export async function getPilotData(token: string): Promise<PilotData> {
  const data = await staffGql<{ catalog_exercises: PilotExercise[] }>(
    token,
    `query MuscleMapPilot {
      catalog_exercises(where: { active: { _eq: true } }, order_by: { exo_id: asc }) {
        exo_id display_name muscles_inherited primary_muscle_group_id
        primary_muscle_group { code }
        movement_type { code }
        resolved_muscles(order_by: { sort_order: asc }) {
          muscle_id role sort_order muscle { code name }
        }
      }
    }`,
  );
  return { exercises: data.catalog_exercises };
}
