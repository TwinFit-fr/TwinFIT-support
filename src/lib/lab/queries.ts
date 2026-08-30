import { staffGql } from "@/lib/staff-gql";

export type LabExerciseRow = {
  catalog_exo_id: number;
  active: boolean;
  sort_order: number;
  notes: string | null;
  catalogExercise?: { exo_id: number; display_name: string } | null;
  sets_aggregate?: { aggregate?: { count?: number } | null } | null;
};

export type LabGlobalStatRow = {
  catalog_exo_id: number;
  total_sets: number;
  labExercise: LabExerciseRow | null;
  catalogExercise?: { exo_id: number; display_name: string } | null;
};

export type LabUserStatRow = {
  user_id: string | null;
  catalog_exo_id: number;
  set_count: number;
  catalogExercise?: { exo_id: number; display_name: string } | null;
  labExercise?: LabExerciseRow | null;
  user?: { id: string; email: string } | null;
};

const LAB_EXERCISE_FIELDS = `
  catalog_exo_id
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
        sets_aggregate {
          aggregate { count }
        }
      }
    }`,
  );
  return data.lab_exercises ?? [];
}

export async function listLabGlobalStats(token: string): Promise<LabGlobalStatRow[]> {
  const data = await staffGql<{
    counts: { catalog_exo_id: number }[];
    globalByExercise: {
      catalog_exo_id: number;
      catalogExercise: { exo_id: number; display_name: string } | null;
    }[];
    pool: LabExerciseRow[];
  }>(
    token,
    `query {
      globalByExercise: lab_sets(distinct_on: catalog_exo_id, order_by: [{ catalog_exo_id: asc }]) {
        catalog_exo_id
        catalogExercise { exo_id display_name }
      }
      counts: lab_sets {
        catalog_exo_id
      }
      pool: lab_exercises {
        ${LAB_EXERCISE_FIELDS}
      }
    }`,
  );

  const countByExo = new Map<number, number>();
  for (const row of data.counts ?? []) {
    countByExo.set(row.catalog_exo_id, (countByExo.get(row.catalog_exo_id) ?? 0) + 1);
  }

  const poolByExo = new Map(
    (data.pool ?? []).map((row) => [row.catalog_exo_id, row]),
  );

  const exoIds = new Set<number>([
    ...countByExo.keys(),
    ...(data.globalByExercise ?? []).map((r) => r.catalog_exo_id),
  ]);

  return [...exoIds]
    .map((catalog_exo_id) => {
      const fromSet = (data.globalByExercise ?? []).find((r) => r.catalog_exo_id === catalog_exo_id);
      return {
        catalog_exo_id,
        total_sets: countByExo.get(catalog_exo_id) ?? 0,
        labExercise: poolByExo.get(catalog_exo_id) ?? null,
        catalogExercise: fromSet?.catalogExercise ?? poolByExo.get(catalog_exo_id)?.catalogExercise ?? null,
      };
    })
    .sort((a, b) => b.total_sets - a.total_sets);
}

export async function listLabUserStats(token: string): Promise<LabUserStatRow[]> {
  const data = await staffGql<{
    lab_sets: {
      user_id: string | null;
      catalog_exo_id: number;
      catalogExercise: { exo_id: number; display_name: string } | null;
      user: { id: string; email: string } | null;
    }[];
    pool: LabExerciseRow[];
  }>(
    token,
    `query {
      lab_sets {
        user_id
        catalog_exo_id
        catalogExercise { exo_id display_name }
        user { id email }
      }
      pool: lab_exercises {
        ${LAB_EXERCISE_FIELDS}
      }
    }`,
  );

  const poolByExo = new Map(
    (data.pool ?? []).map((row) => [row.catalog_exo_id, row]),
  );

  const grouped = new Map<string, LabUserStatRow>();
  for (const row of data.lab_sets ?? []) {
    const userKey = row.user_id ?? "__deleted__";
    const key = `${userKey}:${row.catalog_exo_id}`;
    const prev = grouped.get(key);
    if (prev) {
      prev.set_count += 1;
    } else {
      grouped.set(key, {
        user_id: row.user_id,
        catalog_exo_id: row.catalog_exo_id,
        set_count: 1,
        catalogExercise: row.catalogExercise,
        labExercise: poolByExo.get(row.catalog_exo_id) ?? null,
        user: row.user,
      });
    }
  }

  return [...grouped.values()].sort((a, b) =>
    (a.user_id ?? "").localeCompare(b.user_id ?? "") || b.set_count - a.set_count,
  );
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

export async function updateLabExercise(
  token: string,
  catalogExoId: number,
  patch: Partial<{
    active: boolean;
    notes: string | null;
    sort_order: number;
  }>,
): Promise<LabExerciseRow> {
  const data = await staffGql<{ update_lab_exercises_by_pk: LabExerciseRow }>(
    token,
    `mutation($id: Int!, $patch: lab_exercises_set_input!) {
      update_lab_exercises_by_pk(pk_columns: { catalog_exo_id: $id }, _set: $patch) {
        ${LAB_EXERCISE_FIELDS}
      }
    }`,
    { id: catalogExoId, patch },
  );
  if (!data.update_lab_exercises_by_pk) {
    throw new Error("Lab exercise not found");
  }
  return data.update_lab_exercises_by_pk;
}

export type CatalogCandidate = {
  exo_id: number;
  display_name: string;
  primary_muscle_group?: { code: string; name: string } | null;
  equipment?: { code: string; name: string } | null;
};

export async function listCatalogCandidates(token: string): Promise<CatalogCandidate[]> {
  const data = await staffGql<{
    catalog_exercises: CatalogCandidate[];
    lab_exercises: { catalog_exo_id: number }[];
  }>(
    token,
    `query {
      catalog_exercises(where: { active: { _eq: true } }, order_by: { exo_id: asc }) {
        exo_id
        display_name
        primary_muscle_group { code name }
        equipment { code name }
      }
      lab_exercises {
        catalog_exo_id
      }
    }`,
  );
  const linked = new Set((data.lab_exercises ?? []).map((row) => row.catalog_exo_id));
  return (data.catalog_exercises ?? [])
    .filter((ex) => !linked.has(ex.exo_id))
    .sort((a, b) => a.exo_id - b.exo_id);
}

export function labExerciseLabel(row: {
  catalog_exo_id: number;
  catalogExercise?: { display_name: string } | null;
}): string {
  return row.catalogExercise?.display_name ?? `exo ${row.catalog_exo_id}`;
}
