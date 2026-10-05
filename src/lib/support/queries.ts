import { staffGql } from "@/lib/staff-gql";
import type {
  SupportUserLookup,
  SupportUserSearchHit,
  SupportUserSection,
  SupportUserSectionData,
  SupportUserSessionRow,
} from "./types";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeSearchTerm(query: string) {
  const trimmed = query.trim();
  if (trimmed.startsWith("@")) return trimmed.slice(1);
  return trimmed;
}

function toSearchHit(
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    subscription_tier: string;
    user: {
      id: string;
      email: string;
      emailVerified: boolean;
      disabled: boolean;
      defaultRole: string | null;
      roles: Array<{ role: string }>;
    } | null;
  },
): SupportUserSearchHit | null {
  if (!profile.user) return null;
  return {
    id: profile.user.id,
    email: profile.user.email,
    emailVerified: profile.user.emailVerified,
    disabled: profile.user.disabled,
    defaultRole: profile.user.defaultRole,
    roles: profile.user.roles,
    username: profile.username,
    display_name: profile.display_name,
    subscription_tier: profile.subscription_tier,
  };
}

export async function searchUsers(
  accessToken: string,
  query: string,
  limit = 10,
): Promise<SupportUserSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 4) return [];

  if (UUID_RE.test(trimmed)) {
    const result = await lookupUserById(accessToken, trimmed);
    if (!result?.user) return [];
    return [
      {
        id: result.user.id,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        disabled: result.user.disabled,
        defaultRole: result.user.defaultRole,
        roles: result.user.roles,
        username: result.profile?.username ?? null,
        display_name: result.profile?.display_name ?? null,
        subscription_tier: result.profile?.subscription_tier ?? "free",
      },
    ];
  }

  const term = normalizeSearchTerm(trimmed);
  const pattern = `%${term}%`;

  // Two root queries: nested `{ user: { email: { _ilike } } }` is unreliable for
  // partial email matches; staff can select both tables directly.
  // email/username are citext; display_name is text — Hasura needs matching variable types.
  const data = await staffGql<{
    byEmail: Array<{
      id: string;
      email: string;
      emailVerified: boolean;
      disabled: boolean;
      defaultRole: string | null;
      roles: Array<{ role: string }>;
    }>;
    byProfile: Array<{
      id: string;
      username: string | null;
      display_name: string | null;
      subscription_tier: string;
      user: {
        id: string;
        email: string;
        emailVerified: boolean;
        disabled: boolean;
        defaultRole: string | null;
        roles: Array<{ role: string }>;
      } | null;
    }>;
  }>(
    accessToken,
    `query SupportUserSearch($pattern: citext!, $patternText: String!, $limit: Int!) {
      byEmail: users(
        where: { email: { _ilike: $pattern } }
        order_by: { email: asc }
        limit: $limit
      ) {
        id
        email
        emailVerified
        disabled
        defaultRole
        roles { role }
      }
      byProfile: profiles(
        where: {
          _or: [
            { username: { _ilike: $pattern } }
            { display_name: { _ilike: $patternText } }
          ]
        }
        order_by: { username: asc_nulls_last }
        limit: $limit
      ) {
        id
        username
        display_name
        subscription_tier
        user {
          id
          email
          emailVerified
          disabled
          defaultRole
          roles { role }
        }
      }
    }`,
    { pattern, patternText: pattern, limit },
  );

  const byId = new Map<string, SupportUserSearchHit>();

  for (const profile of data.byProfile) {
    const hit = toSearchHit(profile);
    if (hit) byId.set(hit.id, hit);
  }

  // Hydrate email matches with profile fields when missing
  const emailOnlyIds = data.byEmail
    .map((u) => u.id)
    .filter((id) => !byId.has(id));

  let emailProfiles: Array<{
    id: string;
    username: string | null;
    display_name: string | null;
    subscription_tier: string;
  }> = [];

  if (emailOnlyIds.length > 0) {
    const profileData = await staffGql<{
      profiles: typeof emailProfiles;
    }>(
      accessToken,
      `query SupportSearchProfiles($ids: [uuid!]!) {
        profiles(where: { id: { _in: $ids } }) {
          id
          username
          display_name
          subscription_tier
        }
      }`,
      { ids: emailOnlyIds },
    );
    emailProfiles = profileData.profiles;
  }

  const profileById = new Map(emailProfiles.map((p) => [p.id, p]));

  for (const user of data.byEmail) {
    if (byId.has(user.id)) continue;
    const profile = profileById.get(user.id);
    byId.set(user.id, {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      disabled: user.disabled,
      defaultRole: user.defaultRole,
      roles: user.roles,
      username: profile?.username ?? null,
      display_name: profile?.display_name ?? null,
      subscription_tier: profile?.subscription_tier ?? "free",
    });
  }

  return Array.from(byId.values()).slice(0, limit);
}

export async function lookupUserByEmail(
  accessToken: string,
  email: string,
): Promise<SupportUserLookup | null> {
  const users = await staffGql<{
    users: Array<{ id: string }>;
  }>(
    accessToken,
    `query($email: citext!) {
      users(where: { email: { _eq: $email } }, limit: 1) { id }
    }`,
    { email },
  );
  const userId = users.users[0]?.id;
  if (!userId) return null;
  return lookupUserById(accessToken, userId);
}

export async function lookupUserByUsername(
  accessToken: string,
  username: string,
): Promise<SupportUserLookup | null> {
  const profiles = await staffGql<{
    profiles: Array<{ id: string }>;
  }>(
    accessToken,
    `query($username: citext!) {
      profiles(where: { username: { _eq: $username } }, limit: 1) { id }
    }`,
    { username },
  );
  const userId = profiles.profiles[0]?.id;
  if (!userId) return null;
  return lookupUserById(accessToken, userId);
}

export async function lookupUserById(
  accessToken: string,
  userId: string,
): Promise<SupportUserLookup | null> {
  const data = await staffGql<{
    users: SupportUserLookup["user"][];
    profiles: SupportUserLookup["profile"][];
    workout_sessions_aggregate: { aggregate: { count: number } };
    open_session: SupportUserLookup["openSession"][];
    workout_templates_aggregate: { aggregate: { count: number } };
    routines: Array<{ id: string }>;
    customExercises: Array<{ id: string }>;
  }>(
    accessToken,
    `query SupportUserLookup($id: uuid!) {
      users(where: { id: { _eq: $id } }, limit: 1) {
        id
        email
        emailVerified
        disabled
        createdAt
        lastSeen
        defaultRole
        roles { role }
      }
      profiles(where: { id: { _eq: $id } }, limit: 1) {
        id
        username
        display_name
        date_of_birth
        gender
        height_cm
        weight_kg
        sessions_per_week
        hypertrophy_level
        strength_level
        endurance_level
        notifications_enabled
        avatar_url
        subscription_tier
        subscription_expires_at
        subscription_provider
        subscription_external_id
        inserted_at
        updated_at
        subscription_tier_row {
          display_name
          templates_limit
          history_months
          routines_enabled
          support_enabled
          sensors_entitled
        }
      }
      workout_sessions_aggregate(
        where: { user_id: { _eq: $id }, ended_at: { _is_null: false } }
      ) {
        aggregate { count }
      }
      open_session: workout_sessions(
        where: { user_id: { _eq: $id }, ended_at: { _is_null: true } }
        limit: 1
      ) {
        id
        name
        started_at
      }
      workout_templates_aggregate(where: { user_id: { _eq: $id } }) {
        aggregate { count }
      }
      routines: workout_routines(where: { user_id: { _eq: $id } }, limit: 500) {
        id
      }
      customExercises: workout_custom_exercises(where: { user_id: { _eq: $id } }, limit: 500) {
        id
      }
    }`,
    { id: userId },
  );

  if (!data.users[0]) return null;

  return {
    user: data.users[0],
    profile: data.profiles[0] ?? null,
    finishedSessions: data.workout_sessions_aggregate.aggregate.count,
    templateCount: data.workout_templates_aggregate.aggregate.count,
    routineCount: data.routines.length,
    customExerciseCount: data.customExercises.length,
    openSession: data.open_session[0] ?? null,
  };
}

export async function lookupUser(
  accessToken: string,
  query: string,
): Promise<SupportUserLookup | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (UUID_RE.test(trimmed)) return lookupUserById(accessToken, trimmed);
  if (trimmed.startsWith("@")) {
    return lookupUserByUsername(accessToken, trimmed.slice(1));
  }
  if (trimmed.includes("@")) {
    return lookupUserByEmail(accessToken, trimmed);
  }
  return lookupUserByUsername(accessToken, trimmed);
}

export async function fetchUserSection(
  accessToken: string,
  userId: string,
  section: SupportUserSection,
): Promise<SupportUserSectionData> {
  switch (section) {
    case "sessions": {
      const data = await staffGql<{
        open_session: SupportUserLookup["openSession"][];
        sessions: SupportUserSessionRow[];
      }>(
        accessToken,
        `query SupportUserSessions($id: uuid!) {
          open_session: workout_sessions(
            where: { user_id: { _eq: $id }, ended_at: { _is_null: true } }
            limit: 1
          ) {
            id
            name
            started_at
          }
          sessions: v_session_list_summary(
            where: { user_id: { _eq: $id } }
            order_by: { started_at: desc }
            limit: 50
          ) {
            session_id
            name
            started_at
            ended_at
            session_tonnage_kg
            total_sets
            total_reps
            exercise_count
            main_muscle_groups
            template_id
          }
        }`,
        { id: userId },
      );
      return {
        section: "sessions",
        openSession: data.open_session[0] ?? null,
        sessions: data.sessions,
      };
    }
    case "templates": {
      const data = await staffGql<{
        templates: Array<{
          id: string;
          name: string;
          sort_order: number | null;
          inserted_at: string;
          updated_at: string;
          exercises: Array<{ id: string }>;
        }>;
      }>(
        accessToken,
        `query SupportUserTemplates($id: uuid!) {
          templates: workout_templates(
            where: { user_id: { _eq: $id } }
            order_by: { updated_at: desc }
            limit: 50
          ) {
            id
            name
            sort_order
            inserted_at
            updated_at
            exercises { id }
          }
        }`,
        { id: userId },
      );
      return {
        section: "templates",
        templates: data.templates.map((t) => ({
          id: t.id,
          name: t.name,
          sort_order: t.sort_order,
          inserted_at: t.inserted_at,
          updated_at: t.updated_at,
          exerciseCount: t.exercises.length,
        })),
      };
    }
    case "routines": {
      const data = await staffGql<{
        routines: Array<{
          id: string;
          name: string;
          is_active: boolean;
          last_performed_at: string | null;
          updated_at: string;
          steps: Array<{ id: string }>;
        }>;
      }>(
        accessToken,
        `query SupportUserRoutines($id: uuid!) {
          routines: workout_routines(
            where: { user_id: { _eq: $id } }
            order_by: { updated_at: desc }
            limit: 50
          ) {
            id
            name
            is_active
            last_performed_at
            updated_at
            steps { id }
          }
        }`,
        { id: userId },
      );
      return {
        section: "routines",
        routines: data.routines.map((r) => ({
          id: r.id,
          name: r.name,
          is_active: r.is_active,
          last_performed_at: r.last_performed_at,
          updated_at: r.updated_at,
          stepCount: r.steps.length,
        })),
      };
    }
    case "custom": {
      const data = await staffGql<{
        customExercises: Array<{
          id: string;
          display_name: string;
          active: boolean;
          inserted_at: string;
          updated_at: string;
        }>;
      }>(
        accessToken,
        `query SupportUserCustom($id: uuid!) {
          customExercises: workout_custom_exercises(
            where: { user_id: { _eq: $id } }
            order_by: { updated_at: desc }
            limit: 50
          ) {
            id
            display_name
            active
            inserted_at
            updated_at
          }
        }`,
        { id: userId },
      );
      return {
        section: "custom",
        customExercises: data.customExercises,
      };
    }
    default: {
      const _exhaustive: never = section;
      throw new Error(`Unknown section: ${_exhaustive}`);
    }
  }
}
