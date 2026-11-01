export type SupportUserRole = {
  role: string;
};

export type SupportUserSearchHit = {
  id: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
  defaultRole: string | null;
  roles: SupportUserRole[];
  username: string | null;
  display_name: string | null;
  effective_subscription_tier: string;
};

export type SupportSubscriptionTier = {
  code: string;
  display_name: string;
  templates_limit: number | null;
  history_months: number | null;
  routines_enabled: boolean;
  support_enabled: boolean;
};

/** `public.user_entitlements`: the plan derived from Play subscriptions and Support grants. */
export type SupportUserEntitlement = {
  tier_code: string;
  source: "none" | "google_play" | "manual";
  expires_at: string | null;
  play_purchase_token: string | null;
  play_state: string | null;
  play_product_id: string | null;
  play_base_plan_id: string | null;
  play_expiry_time: string | null;
  play_auto_renewing: boolean | null;
  play_in_free_trial: boolean | null;
  period_started_at: string | null;
  updated_at: string;
};

/** `billing.manual_grants`. */
export type SupportManualGrant = {
  id: string;
  tier_code: string;
  ends_at: string | null;
  reason: string;
  granted_by: string | null;
  revoked_at: string | null;
  inserted_at: string;
  /** Derived on the server: `running` gives the plan now. */
  status: "running" | "ended" | "revoked";
};

export type SupportUserLookup = {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    disabled: boolean;
    createdAt: string;
    lastSeen: string | null;
    defaultRole: string | null;
    roles: SupportUserRole[];
  } | null;
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    date_of_birth: string | null;
    gender: string | null;
    height_cm: number | null;
    weight_kg: number | null;
    sessions_per_week: number | null;
    hypertrophy_level: string | null;
    strength_level: string | null;
    endurance_level: string | null;
    notifications_enabled: boolean | null;
    avatar_url: string | null;
    effective_subscription_tier: string;
    inserted_at: string;
    updated_at: string;
    entitlement: SupportUserEntitlement | null;
  } | null;
  /** `subscription_tiers` row of the effective tier: the limits the server applies now. */
  tier: SupportSubscriptionTier | null;
  /** Support grants of the user, latest first. */
  grants: SupportManualGrant[];
  finishedSessions: number;
  templateCount: number;
  routineCount: number;
  customExerciseCount: number;
  openSession: {
    id: string;
    name: string;
    started_at: string;
  } | null;
};

export type SupportUserSessionRow = {
  session_id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  session_tonnage_kg: number | null;
  total_sets: number | null;
  total_reps: number | null;
  exercise_count: number | null;
  main_muscle_groups: string[] | null;
  template_id: string | null;
};

export type SupportUserTemplateRow = {
  id: string;
  name: string;
  sort_order: number | null;
  inserted_at: string;
  updated_at: string;
  exerciseCount: number;
};

export type SupportUserRoutineRow = {
  id: string;
  name: string;
  is_active: boolean;
  last_performed_at: string | null;
  updated_at: string;
  stepCount: number;
};

export type SupportUserCustomExerciseRow = {
  id: string;
  display_name: string;
  active: boolean;
  inserted_at: string;
  updated_at: string;
};

export type SupportUserCoachPeriodRow = {
  user_id: string;
  period_start: string;
  period_end: string;
  input_tokens: number;
  output_tokens: number;
  embed_tokens: number;
  reserved_tokens: number;
};

export type SupportUserSection =
  | "sessions"
  | "templates"
  | "routines"
  | "custom"
  | "coach";

export type SupportUserSectionData =
  | { section: "sessions"; openSession: SupportUserLookup["openSession"]; sessions: SupportUserSessionRow[] }
  | { section: "templates"; templates: SupportUserTemplateRow[] }
  | { section: "routines"; routines: SupportUserRoutineRow[] }
  | { section: "custom"; customExercises: SupportUserCustomExerciseRow[] }
  | {
      section: "coach";
      tierCode: string;
      monthlyTokenLimit: number | null;
      dailyBurstLimit: number | null;
      periods: SupportUserCoachPeriodRow[];
    };

export type AdminAction =
  | { action: "verify-email"; userId: string }
  | { action: "grant-premium"; userId: string; reason: string; endsAt?: string | null }
  | { action: "revoke-premium"; userId: string }
  | { action: "set-disabled"; userId: string; disabled: boolean };
