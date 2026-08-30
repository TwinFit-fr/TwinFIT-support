import { staffGql } from "@/lib/staff-gql";
import { resolveSupportHasuraRole } from "@/lib/nhost/jwt";

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

export const LAB_SETS_PAGE_SIZE = 250;

export type LabSetRow = {
  id: string;
  user_id: string | null;
  user_name: string;
  catalog_exo_id: number;
  custom_name: string;
  rep_count: number;
  weight_kg: number;
  started_at: string;
  ended_at: string;
  labeled_at: string;
  inserted_at: string;
  storage_path: string;
};

export type LabSetFilters = {
  userId?: string | null;
  catalogExoId?: number;
  from?: string;
  to?: string;
};

export type LabSetFilterOptions = {
  users: { id: string | null; user_name: string }[];
  exercises: { catalog_exo_id: number; custom_name: string }[];
};

type ProfileName = {
  id: string;
  username: string | null;
  display_name: string | null;
};

function profileUserName(profile: ProfileName | undefined, email?: string | null): string {
  if (profile?.display_name?.trim()) return profile.display_name.trim();
  if (profile?.username?.trim()) return `@${profile.username.trim()}`;
  if (email?.trim()) return email.trim();
  return "Deleted account";
}

function exerciseCustomName(
  catalogExoId: number,
  catalogExercise?: { display_name: string } | null,
): string {
  return catalogExercise?.display_name?.trim() || `exo ${catalogExoId}`;
}

async function loadProfilesByIds(
  token: string,
  userIds: (string | null | undefined)[],
): Promise<Map<string, ProfileName>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const data = await staffGql<{ profiles: ProfileName[] }>(
    token,
    `query($ids: [uuid!]!) {
      profiles(where: { id: { _in: $ids } }) {
        id
        username
        display_name
      }
    }`,
    { ids },
  );
  return new Map((data.profiles ?? []).map((row) => [row.id, row]));
}

function labSetsWhere(filters: LabSetFilters): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];
  if (filters.userId === null) {
    clauses.push({ user_id: { _is_null: true } });
  } else if (filters.userId) {
    clauses.push({ user_id: { _eq: filters.userId } });
  }
  if (typeof filters.catalogExoId === "number" && Number.isFinite(filters.catalogExoId)) {
    clauses.push({ catalog_exo_id: { _eq: filters.catalogExoId } });
  }
  if (filters.from || filters.to) {
    const inserted: Record<string, string> = {};
    if (filters.from) inserted._gte = filters.from;
    if (filters.to) inserted._lte = filters.to;
    clauses.push({ inserted_at: inserted });
  }
  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0];
  return { _and: clauses };
}

type LabSetGqlRow = {
  id: string;
  user_id: string | null;
  catalog_exo_id: number;
  rep_count: number;
  weight_kg: number;
  started_at: string;
  ended_at: string;
  labeled_at: string;
  inserted_at: string;
  storage_path: string;
  catalogExercise?: { exo_id: number; display_name: string } | null;
  user?: { id: string; email: string } | null;
};

export async function listLabSets(
  token: string,
  filters: LabSetFilters,
  page: number,
  pageSize: number = LAB_SETS_PAGE_SIZE,
): Promise<{ sets: LabSetRow[]; total: number; page: number; pageSize: number }> {
  const limit = Math.min(Math.max(pageSize, 1), LAB_SETS_PAGE_SIZE);
  const safePage = Math.max(page, 1);
  const offset = (safePage - 1) * limit;
  const where = labSetsWhere(filters);

  const data = await staffGql<{
    lab_sets: LabSetGqlRow[];
    lab_sets_aggregate: { aggregate?: { count?: number } | null };
  }>(
    token,
    `query($where: lab_sets_bool_exp!, $limit: Int!, $offset: Int!) {
      lab_sets(
        where: $where
        order_by: [{ inserted_at: desc }, { id: desc }]
        limit: $limit
        offset: $offset
      ) {
        id
        user_id
        catalog_exo_id
        rep_count
        weight_kg
        started_at
        ended_at
        labeled_at
        inserted_at
        storage_path
        catalogExercise { exo_id display_name }
        user { id email }
      }
      lab_sets_aggregate(where: $where) {
        aggregate { count }
      }
    }`,
    { where, limit, offset },
  );

  const rows = data.lab_sets ?? [];
  const profiles = await loadProfilesByIds(
    token,
    rows.map((row) => row.user_id),
  );

  return {
    sets: rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      user_name: row.user_id
        ? profileUserName(profiles.get(row.user_id), row.user?.email)
        : "Deleted account",
      catalog_exo_id: row.catalog_exo_id,
      custom_name: exerciseCustomName(row.catalog_exo_id, row.catalogExercise),
      rep_count: row.rep_count,
      weight_kg: row.weight_kg,
      started_at: row.started_at,
      ended_at: row.ended_at,
      labeled_at: row.labeled_at,
      inserted_at: row.inserted_at,
      storage_path: row.storage_path,
    })),
    total: data.lab_sets_aggregate.aggregate?.count ?? 0,
    page: safePage,
    pageSize: limit,
  };
}

export async function listLabSetFilterOptions(token: string): Promise<LabSetFilterOptions> {
  const data = await staffGql<{
    collectors: { user_id: string | null; user?: { id: string; email: string } | null }[];
    exercises: {
      catalog_exo_id: number;
      catalogExercise?: { exo_id: number; display_name: string } | null;
    }[];
  }>(
    token,
    `query {
      collectors: lab_sets(distinct_on: user_id, order_by: [{ user_id: asc }]) {
        user_id
        user { id email }
      }
      exercises: lab_sets(distinct_on: catalog_exo_id, order_by: [{ catalog_exo_id: asc }]) {
        catalog_exo_id
        catalogExercise { exo_id display_name }
      }
    }`,
  );

  const profiles = await loadProfilesByIds(
    token,
    (data.collectors ?? []).map((row) => row.user_id),
  );

  const users = (data.collectors ?? [])
    .map((row) => ({
      id: row.user_id,
      user_name: row.user_id
        ? profileUserName(profiles.get(row.user_id), row.user?.email)
        : "Deleted account",
    }))
    .sort((a, b) => a.user_name.localeCompare(b.user_name));

  const exercises = (data.exercises ?? [])
    .map((row) => ({
      catalog_exo_id: row.catalog_exo_id,
      custom_name: exerciseCustomName(row.catalog_exo_id, row.catalogExercise),
    }))
    .sort((a, b) => a.custom_name.localeCompare(b.custom_name));

  return { users, exercises };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function storageUrl(fileId: string): string {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!subdomain || !region) {
    throw new Error("NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are required");
  }
  return `https://${subdomain}.storage.${region}.nhost.run/v1/files/${fileId}`;
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

export type LabSetFileDownload = {
  body: ReadableStream<Uint8Array> | null;
  contentType: string;
  downloadName: string;
};

export async function downloadLabSetFile(
  token: string,
  setId: string,
): Promise<LabSetFileDownload> {
  const setData = await staffGql<{
    lab_sets_by_pk: {
      id: string;
      storage_path: string;
      catalogExercise?: { display_name: string } | null;
    } | null;
  }>(
    token,
    `query($id: uuid!) {
      lab_sets_by_pk(id: $id) {
        id
        storage_path
        catalogExercise { display_name }
      }
    }`,
    { id: setId },
  );

  const set = setData.lab_sets_by_pk;
  if (!set?.storage_path) {
    throw new Error("Set not found");
  }

  const filesData = await staffGql<{
    files: { id: string; name: string; mimeType: string | null }[];
  }>(
    token,
    `query($name: String!) {
      files(
        where: {
          _and: [
            { bucketId: { _eq: "lab-sensor-samples" } }
            { name: { _eq: $name } }
          ]
        }
        limit: 1
      ) {
        id
        name
        mimeType
      }
    }`,
    { name: set.storage_path },
  );

  const file = filesData.files[0];
  if (!file) {
    throw new Error("Sensor file not found in Storage");
  }

  const leaf = set.storage_path.split("/").pop() || `${set.id}.json`;
  const exoPart = set.catalogExercise?.display_name
    ? `${safeFilenamePart(set.catalogExercise.display_name)}_`
    : "";
  const downloadName = `${exoPart}${leaf}`;

  const role = resolveSupportHasuraRole(token);
  const res = await fetch(storageUrl(file.id), {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-hasura-role": role,
    },
  });
  if (!res.ok) {
    throw new Error(`Storage download failed (${res.status})`);
  }

  return {
    body: res.body,
    contentType: res.headers.get("Content-Type") || file.mimeType || "application/json",
    downloadName,
  };
}
