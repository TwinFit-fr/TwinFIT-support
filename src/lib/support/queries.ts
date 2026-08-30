import { staffGql } from "@/lib/staff-gql";
import type { SupportUserLookup } from "./types";

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
    recent_sessions: SupportUserLookup["recentSessions"];
    workout_templates_aggregate: { aggregate: { count: number } };
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
      }
      profiles(where: { id: { _eq: $id } }, limit: 1) {
        id
        username
        display_name
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
      recent_sessions: v_session_list_summary(
        where: { user_id: { _eq: $id } }
        order_by: { started_at: desc }
        limit: 5
      ) {
        session_id
        name
        started_at
        ended_at
        session_tonnage_kg
        total_sets
      }
      workout_templates_aggregate(where: { user_id: { _eq: $id } }) {
        aggregate { count }
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
    openSession: data.open_session[0] ?? null,
    recentSessions: data.recent_sessions,
  };
}

export async function lookupUser(
  accessToken: string,
  query: string,
): Promise<SupportUserLookup | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) {
    return lookupUserByEmail(accessToken, trimmed);
  }
  const username = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return lookupUserByUsername(accessToken, username);
}
