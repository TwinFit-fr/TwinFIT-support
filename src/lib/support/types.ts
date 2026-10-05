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
  subscription_tier: string;
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

export type SupportUserSection =
  | "sessions"
  | "templates"
  | "routines"
  | "custom";

export type SupportUserSectionData =
  | { section: "sessions"; openSession: SupportUserLookup["openSession"]; sessions: SupportUserSessionRow[] }
  | { section: "templates"; templates: SupportUserTemplateRow[] }
  | { section: "routines"; routines: SupportUserRoutineRow[] }
  | { section: "custom"; customExercises: SupportUserCustomExerciseRow[] };

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
