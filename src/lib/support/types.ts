export type SupportUserLookup = {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    disabled: boolean;
    createdAt: string;
    lastSeen: string | null;
  } | null;
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    subscription_tier: string;
    subscription_expires_at: string | null;
    subscription_provider: string | null;
    subscription_external_id: string | null;
    inserted_at: string;
    updated_at: string;
    subscription_tier_row: {
      display_name: string;
      templates_limit: number | null;
      history_months: number | null;
      routines_enabled: boolean;
      support_enabled: boolean;
      sensors_entitled: boolean;
    } | null;
  } | null;
  finishedSessions: number;
  templateCount: number;
  openSession: {
    id: string;
    name: string;
    started_at: string;
  } | null;
  recentSessions: Array<{
    session_id: string;
    name: string;
    started_at: string;
    ended_at: string | null;
    session_tonnage_kg: number | null;
    total_sets: number | null;
  }>;
};

export type AdminAction =
  | { action: "verify-email"; userId: string }
  | {
      action: "set-subscription";
      userId: string;
      tier: string;
      expiresAt?: string | null;
      provider?: string | null;
      externalId?: string | null;
    }
  | { action: "set-disabled"; userId: string; disabled: boolean };
