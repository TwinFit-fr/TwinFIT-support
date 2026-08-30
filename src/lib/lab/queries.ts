import { staffGql } from "@/lib/staff-gql";

export type LabExerciseRow = {
  id: string;
  kind: "catalog" | "rest";
  catalog_exo_id: number | null;
  display_name: string | null;
  active: boolean;
  sort_order: number;
  notes: string | null;
  catalogExercise?: { exo_id: number; display_name: string } | null;
};

export type LabGlobalStatRow = {
  lab_exercise_id: string;
  total_sets: number;
  updated_at: string;
  labExercise: LabExerciseRow;
};

export type LabUserStatRow = {
  user_id: string;
  lab_exercise_id: string;
  set_count: number;
  updated_at: string;
  labExercise: LabExerciseRow;
  user?: { id: string; email: string; displayName?: string | null } | null;
};

const LAB_EXERCISE_FIELDS = `
  id
  kind
  catalog_exo_id
  display_name
  active
  sort_order
  notes
  catalogExercise {
    exo_id
    display_name
  }
`;

export async function listLabExercises(token: string): Promise<LabExerciseRow[]> {
  const data = await staffGql<{ lab_exercises: LabExerciseRow[] }>(
    token,
    `query {
      lab_exercises(order_by: [{ sort_order: asc }, { inserted_at: asc }]) {
        ${LAB_EXERCISE_FIELDS}
      }
    }`,
  );
  return data.lab_exercises ?? [];
}

export async function listLabGlobalStats(token: string): Promise<LabGlobalStatRow[]> {
  const data = await staffGql<{ lab_exercise_set_stats: LabGlobalStatRow[] }>(
    token,
    `query {
      lab_exercise_set_stats(order_by: { total_sets: desc }) {
        lab_exercise_id
        total_sets
        updated_at
        labExercise {
          ${LAB_EXERCISE_FIELDS}
        }
      }
    }`,
  );
  return data.lab_exercise_set_stats ?? [];
}

export async function listLabUserStats(token: string): Promise<LabUserStatRow[]> {
  const data = await staffGql<{ lab_user_exercise_set_stats: LabUserStatRow[] }>(
    token,
    `query {
      lab_user_exercise_set_stats(order_by: [{ user_id: asc }, { set_count: desc }]) {
        user_id
        lab_exercise_id
        set_count
        updated_at
        labExercise {
          ${LAB_EXERCISE_FIELDS}
        }
        user {
          id
          email
          displayName
        }
      }
    }`,
  );
  return data.lab_user_exercise_set_stats ?? [];
}

export async function linkCatalogExercise(
  token: string,
  catalogExoId: number,
): Promise<LabExerciseRow> {
  const data = await staffGql<{ insert_lab_exercises_one: LabExerciseRow }>(
    token,
    `mutation($object: lab_exercises_insert_input!) {
      insert_lab_exercises_one(object: $object) {
        ${LAB_EXERCISE_FIELDS}
      }
    }`,
    {
      object: {
        kind: "catalog",
        catalog_exo_id: catalogExoId,
        active: true,
      },
    },
  );
  if (!data.insert_lab_exercises_one) {
    throw new Error("Failed to link catalog exercise");
  }
  return data.insert_lab_exercises_one;
}

export async function createRestExercise(
  token: string,
  input: { display_name: string; notes?: string; sort_order?: number; active?: boolean },
): Promise<LabExerciseRow> {
  const data = await staffGql<{ insert_lab_exercises_one: LabExerciseRow }>(
    token,
    `mutation($object: lab_exercises_insert_input!) {
      insert_lab_exercises_one(object: $object) {
        ${LAB_EXERCISE_FIELDS}
      }
    }`,
    {
      object: {
        kind: "rest",
        display_name: input.display_name,
        notes: input.notes ?? null,
        sort_order: input.sort_order ?? 0,
        active: input.active ?? true,
      },
    },
  );
  if (!data.insert_lab_exercises_one) {
    throw new Error("Failed to create rest exercise");
  }
  return data.insert_lab_exercises_one;
}

export async function updateLabExercise(
  token: string,
  id: string,
  patch: Partial<{
    active: boolean;
    notes: string | null;
    sort_order: number;
    display_name: string | null;
  }>,
): Promise<LabExerciseRow> {
  const data = await staffGql<{ update_lab_exercises_by_pk: LabExerciseRow }>(
    token,
    `mutation($id: uuid!, $patch: lab_exercises_set_input!) {
      update_lab_exercises_by_pk(pk_columns: { id: $id }, _set: $patch) {
        ${LAB_EXERCISE_FIELDS}
      }
    }`,
    { id, patch },
  );
  if (!data.update_lab_exercises_by_pk) {
    throw new Error("Lab exercise not found");
  }
  return data.update_lab_exercises_by_pk;
}

export async function listCatalogCandidates(token: string): Promise<
  { exo_id: number; display_name: string }[]
> {
  const data = await staffGql<{
    catalog_exercises: { exo_id: number; display_name: string }[];
    lab_exercises: { catalog_exo_id: number | null }[];
  }>(
    token,
    `query {
      catalog_exercises(where: { active: { _eq: true } }, order_by: { display_name: asc }) {
        exo_id
        display_name
      }
      lab_exercises(where: { kind: { _eq: "catalog" } }) {
        catalog_exo_id
      }
    }`,
  );
  const linked = new Set(
    (data.lab_exercises ?? [])
      .map((row) => row.catalog_exo_id)
      .filter((id): id is number => id != null),
  );
  return (data.catalog_exercises ?? []).filter((ex) => !linked.has(ex.exo_id));
}

export function labExerciseLabel(row: LabExerciseRow): string {
  if (row.kind === "rest") return row.display_name ?? "Rest";
  return row.display_name ?? row.catalogExercise?.display_name ?? `exo ${row.catalog_exo_id}`;
}
