import { staffGql } from "@/lib/staff-gql";
import type { ComparisonA } from "./compare-a";

/**
 * Data of the B vs A comparison: every active exercise with its resolved muscles (pair's when
 * inherited, its own when custom), plus what option A needs to pick a map (read-only).
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

export type PilotData = { exercises: PilotExercise[]; a: ComparisonA };

const CHOICES = "id code map_views map_crops map_view map_crop";

export async function getPilotData(token: string): Promise<PilotData> {
  const data = await staffGql<{
    catalog_exercises: PilotExercise[];
    catalog_body_regions: ComparisonA["regions"];
    catalog_muscle_groups: ComparisonA["groups"];
    catalog_muscles: ComparisonA["muscles"];
    images_muscle_map_images: ComparisonA["maps"];
  }>(
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
      catalog_body_regions { ${CHOICES} }
      catalog_muscle_groups { ${CHOICES} body_region_id group_muscles { role muscle { id } } }
      catalog_muscles { ${CHOICES} }
      images_muscle_map_images(
        where: { active: { _eq: true }, style: { is_default: { _eq: true } } }
      ) { muscle_id muscle_group_id body_region_id view crop image_url }
    }`,
  );
  return {
    exercises: data.catalog_exercises,
    a: {
      regions: data.catalog_body_regions,
      groups: data.catalog_muscle_groups,
      muscles: data.catalog_muscles,
      maps: data.images_muscle_map_images,
    },
  };
}
