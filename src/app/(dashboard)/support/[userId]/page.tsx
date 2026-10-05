"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  User,
  CreditCard,
  Activity,
  CheckCircle,
  Ban,
  RefreshCw,
  LayoutTemplate,
  Route,
  Dumbbell,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RoleBadges } from "@/components/support/role-badges";
import { SupportSectionTable } from "@/components/support/support-section-table";
import {
  SupportUserTabs,
  type SupportUserTabId,
} from "@/components/support/support-user-tabs";
import { Badge, Button, Card, Input, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useIsAdmin } from "@/hooks/use-is-staff";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { formatDate, formatDuration } from "@/lib/support/format";
import type {
  SupportUserLookup,
  SupportUserSectionData,
} from "@/lib/support/types";

type PendingAction =
  | { type: "verify-email" }
  | { type: "set-subscription"; tier: string; expiresAt: string | null }
  | { type: "set-disabled"; disabled: boolean };

const SECTION_BY_TAB: Partial<Record<SupportUserTabId, SupportUserSectionData["section"]>> = {
  sessions: "sessions",
  templates: "templates",
  routines: "routines",
  custom: "custom",
};

export default function SupportUserPage() {
  const params = useParams<{ userId: string }>();
  const staffFetch = useStaffFetch();
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<SupportUserTabId>("account");

  const {
    data: lookup,
    error: loadError,
    isValidating: loading,
    mutate,
  } = useStaffSWR<SupportUserLookup>(
    `/api/support/lookup?q=${encodeURIComponent(params.userId)}`,
    { shouldRetryOnError: false },
  );

  const sectionKey = SECTION_BY_TAB[activeTab];
  const {
    data: sectionData,
    isValidating: sectionLoading,
  } = useStaffSWR<SupportUserSectionData>(
    sectionKey
      ? `/api/support/users/${params.userId}/data?section=${sectionKey}`
      : null,
    { shouldRetryOnError: false },
  );

  const data = lookup ?? null;
  const error = loadError ? loadError.message || "Failed to load user" : null;
  const [tierChoice, setTier] = useState<string | null>(null);
  const tier = tierChoice ?? data?.profile?.subscription_tier ?? "free";
  const [expiresAt, setExpiresAt] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    setTier(null);
    await mutate();
  }

  async function runAction(body: Record<string, unknown>, successMessage: string) {
    setActionLoading(true);
    try {
      await staffFetch("/api/support/actions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success(successMessage);
      setPendingAction(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmPendingAction() {
    if (!data?.user || !pendingAction) return;
    const userId = data.user.id;

    if (pendingAction.type === "verify-email") {
      await runAction(
        { action: "verify-email", userId },
        `Email verified for ${data.user.email}`,
      );
      return;
    }
    if (pendingAction.type === "set-subscription") {
      await runAction(
        {
          action: "set-subscription",
          userId,
          tier: pendingAction.tier,
          expiresAt: pendingAction.expiresAt,
          provider: "manual",
        },
        `Subscription tier set to "${pendingAction.tier}"`,
      );
      return;
    }
    if (pendingAction.type === "set-disabled") {
      await runAction(
        { action: "set-disabled", userId, disabled: pendingAction.disabled },
        pendingAction.disabled ? "Account disabled" : "Account re-enabled",
      );
    }
  }

  function confirmDialogContent(): {
    title: string;
    description: string;
    variant?: "default" | "danger";
  } | null {
    if (!data?.user || !pendingAction) return null;
    const userId = data.user.id;

    if (pendingAction.type === "verify-email") {
      return {
        title: "Verify user email?",
        description: `Mark ${data.user.email} (${userId}) as email-verified immediately.`,
      };
    }
    if (pendingAction.type === "set-subscription") {
      return {
        title: "Update subscription tier?",
        description: `Set subscription to "${pendingAction.tier}"${
          pendingAction.expiresAt ? ` expiring on ${formatDate(pendingAction.expiresAt)}` : ""
        } for ${data.user.email}.`,
      };
    }
    return {
      title: pendingAction.disabled ? "Disable account?" : "Re-enable account?",
      description: `${pendingAction.disabled ? "Disable" : "Re-enable"} access for ${data.user.email} (${userId}).`,
      variant: "danger",
    };
  }

  const dialog = confirmDialogContent();

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-10 w-full max-w-xl" />
        <Card className="space-y-4 p-6">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-40 w-full" />
        </Card>
      </div>
    );
  }

  if (error || !data?.user) {
    return (
      <div className="space-y-4">
        <Link href="/support">
          <Button variant="secondary">
            <ArrowLeft className="h-4 w-4" /> Back to support
          </Button>
        </Link>
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error ?? "User not found"}
        </p>
      </div>
    );
  }

  const userId = data.user.id;
  const profile = data.profile;
  const tierRow = profile?.subscription_tier_row;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Link
            href="/support"
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to support search
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            {profile?.display_name || data.user.email}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-600">{data.user.email}</p>
          <RoleBadges
            defaultRole={data.user.defaultRole}
            roles={data.user.roles}
            className="mt-2"
          />
          <p className="mt-1 font-mono text-xs text-zinc-500">User ID: {userId}</p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => void load()}
          disabled={loading}
          className="self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <QuickStat label="Workouts" value={String(data.finishedSessions)} />
        <QuickStat label="Templates" value={String(data.templateCount)} />
        <QuickStat label="Routines" value={String(data.routineCount)} />
        <QuickStat label="Custom exercises" value={String(data.customExerciseCount)} />
      </div>

      <ConfirmDialog
        open={Boolean(pendingAction && dialog)}
        title={dialog?.title ?? ""}
        description={dialog?.description ?? ""}
        variant={dialog?.variant}
        loading={actionLoading}
        confirmLabel="Confirm"
        onConfirm={() => void confirmPendingAction()}
        onCancel={() => setPendingAction(null)}
      />

      <Card className="space-y-5 p-6">
        <SupportUserTabs active={activeTab} onChange={setActiveTab} />

        {activeTab === "account" && (
          <div className="space-y-4">
            <SectionHeader icon={<User className="h-5 w-5" />} title="Account" />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Email" value={data.user.email} />
              <Field label="Username" value={profile?.username ? `@${profile.username}` : "—"} />
              <Field
                label="Email verified"
                value={
                  data.user.emailVerified ? (
                    <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                      Verified
                    </Badge>
                  ) : (
                    <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
                      Unverified
                    </Badge>
                  )
                }
              />
              <Field
                label="Status"
                value={
                  data.user.disabled ? (
                    <Badge className="border border-red-200 bg-red-50 text-red-700">Disabled</Badge>
                  ) : (
                    <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                      Active
                    </Badge>
                  )
                }
              />
              <Field label="Registered" value={formatDate(data.user.createdAt)} />
              <Field label="Last activity" value={formatDate(data.user.lastSeen)} />
              <Field
                label="Roles"
                value={
                  <RoleBadges defaultRole={data.user.defaultRole} roles={data.user.roles} />
                }
              />
            </dl>
            <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
              {!data.user.emailVerified && (
                <Button type="button" onClick={() => setPendingAction({ type: "verify-email" })}>
                  <CheckCircle className="h-4 w-4" /> Verify email
                </Button>
              )}
              {isAdmin && (
                <Button
                  type="button"
                  variant={data.user.disabled ? "default" : "danger"}
                  onClick={() =>
                    setPendingAction({
                      type: "set-disabled",
                      disabled: !data.user?.disabled,
                    })
                  }
                >
                  <Ban className="h-4 w-4" />
                  {data.user.disabled ? "Re-enable account" : "Disable account"}
                </Button>
              )}
            </div>
          </div>
        )}

        {activeTab === "profile" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <SectionHeader icon={<User className="h-5 w-5" />} title="Profile & preferences" />
              <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-3">
                <Field label="Display name" value={profile?.display_name ?? "—"} />
                <Field label="Date of birth" value={profile?.date_of_birth ?? "—"} />
                <Field label="Gender" value={profile?.gender ?? "—"} />
                <Field
                  label="Height"
                  value={profile?.height_cm != null ? `${profile.height_cm} cm` : "—"}
                />
                <Field
                  label="Weight"
                  value={profile?.weight_kg != null ? `${profile.weight_kg} kg` : "—"}
                />
                <Field
                  label="Sessions / week"
                  value={profile?.sessions_per_week != null ? String(profile.sessions_per_week) : "—"}
                />
                <Field label="Hypertrophy" value={profile?.hypertrophy_level ?? "—"} />
                <Field label="Strength" value={profile?.strength_level ?? "—"} />
                <Field label="Endurance" value={profile?.endurance_level ?? "—"} />
                <Field
                  label="Notifications"
                  value={profile?.notifications_enabled ? "Enabled" : "Disabled"}
                />
                <Field
                  label="Avatar"
                  value={
                    profile?.avatar_url ? (
                      <a
                        href={profile.avatar_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-700 underline"
                      >
                        View
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <Field label="Profile updated" value={formatDate(profile?.updated_at)} />
              </dl>
            </div>

            <div className="space-y-4 border-t border-zinc-100 pt-4">
              <SectionHeader
                icon={<CreditCard className="h-5 w-5" />}
                title="Subscription & entitlements"
                badge={profile?.subscription_tier ?? "free"}
              />
              <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-3">
                <Field
                  label="Tier"
                  value={tierRow?.display_name ?? profile?.subscription_tier ?? "free"}
                />
                <Field
                  label="Expires"
                  value={
                    profile?.subscription_expires_at
                      ? formatDate(profile.subscription_expires_at)
                      : "No expiry"
                  }
                />
                <Field label="Provider" value={profile?.subscription_provider ?? "manual"} />
                <Field
                  label="Templates limit"
                  value={tierRow?.templates_limit != null ? String(tierRow.templates_limit) : "—"}
                />
                <Field
                  label="History months"
                  value={tierRow?.history_months != null ? String(tierRow.history_months) : "—"}
                />
                <Field label="Routines" value={tierRow?.routines_enabled ? "Yes" : "No"} />
                <Field label="Support" value={tierRow?.support_enabled ? "Yes" : "No"} />
                <Field label="Sensors" value={tierRow?.sensors_entitled ? "Yes" : "No"} />
                <Field
                  label="External ID"
                  value={
                    <span className="break-all font-mono text-xs">
                      {profile?.subscription_external_id ?? "—"}
                    </span>
                  }
                />
              </dl>

              <div className="space-y-3 border-t border-zinc-100 pt-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Admin tier override
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                  >
                    <option value="free">free</option>
                    <option value="premium">premium</option>
                    <option value="premium_plus">premium_plus</option>
                    <option value="trial">trial</option>
                  </select>
                  <Input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  onClick={() =>
                    setPendingAction({
                      type: "set-subscription",
                      tier,
                      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
                    })
                  }
                  className="w-full sm:w-auto"
                >
                  Update subscription
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "sessions" && (
          <div className="space-y-4">
            <SectionHeader
              icon={<Activity className="h-5 w-5" />}
              title="Workout history"
              subtitle={`${data.finishedSessions} finished sessions`}
            />
            {sectionLoading && !sectionData && <Skeleton className="h-40 w-full" />}
            {sectionData?.section === "sessions" && sectionData.openSession && (
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">
                      Live session: &quot;{sectionData.openSession.name}&quot;
                    </p>
                    <p className="text-xs text-emerald-700">
                      Started {formatDate(sectionData.openSession.started_at)}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {sectionData?.section === "sessions" && (
              <SupportSectionTable
                columns={[
                  { key: "name", header: "Workout", render: (s) => s.name },
                  {
                    key: "started",
                    header: "Started",
                    render: (s) => (
                      <span className="text-xs text-zinc-600">{formatDate(s.started_at)}</span>
                    ),
                  },
                  {
                    key: "duration",
                    header: "Duration",
                    render: (s) => formatDuration(s.started_at, s.ended_at),
                  },
                  {
                    key: "sets",
                    header: "Sets",
                    render: (s) => s.total_sets ?? "—",
                  },
                  {
                    key: "reps",
                    header: "Reps",
                    render: (s) => s.total_reps ?? "—",
                  },
                  {
                    key: "tonnage",
                    header: "Tonnage",
                    render: (s) =>
                      s.session_tonnage_kg != null
                        ? `${s.session_tonnage_kg.toLocaleString()} kg`
                        : "—",
                  },
                  {
                    key: "muscles",
                    header: "Muscles",
                    render: (s) =>
                      s.main_muscle_groups?.length
                        ? s.main_muscle_groups.join(", ")
                        : "—",
                  },
                ]}
                rows={sectionData.sessions}
                rowKey={(s) => s.session_id}
                emptyMessage="No workout sessions recorded yet."
              />
            )}
          </div>
        )}

        {activeTab === "templates" && (
          <div className="space-y-4">
            <SectionHeader
              icon={<LayoutTemplate className="h-5 w-5" />}
              title="Workout templates"
              subtitle={`${data.templateCount} total`}
            />
            {sectionLoading && !sectionData && <Skeleton className="h-40 w-full" />}
            {sectionData?.section === "templates" && (
              <SupportSectionTable
                columns={[
                  { key: "name", header: "Name", render: (t) => t.name },
                  {
                    key: "exercises",
                    header: "Exercises",
                    render: (t) => t.exerciseCount,
                  },
                  {
                    key: "order",
                    header: "Order",
                    render: (t) => t.sort_order ?? "—",
                  },
                  {
                    key: "updated",
                    header: "Updated",
                    render: (t) => (
                      <span className="text-xs text-zinc-600">{formatDate(t.updated_at)}</span>
                    ),
                  },
                ]}
                rows={sectionData.templates}
                rowKey={(t) => t.id}
                emptyMessage="No templates yet."
              />
            )}
          </div>
        )}

        {activeTab === "routines" && (
          <div className="space-y-4">
            <SectionHeader
              icon={<Route className="h-5 w-5" />}
              title="Routines"
              subtitle={`${data.routineCount} total`}
            />
            {sectionLoading && !sectionData && <Skeleton className="h-40 w-full" />}
            {sectionData?.section === "routines" && (
              <SupportSectionTable
                columns={[
                  { key: "name", header: "Name", render: (r) => r.name },
                  {
                    key: "active",
                    header: "Active",
                    render: (r) =>
                      r.is_active ? (
                        <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                          Active
                        </Badge>
                      ) : (
                        <Badge>Inactive</Badge>
                      ),
                  },
                  {
                    key: "steps",
                    header: "Steps",
                    render: (r) => r.stepCount,
                  },
                  {
                    key: "last",
                    header: "Last performed",
                    render: (r) => (
                      <span className="text-xs text-zinc-600">
                        {formatDate(r.last_performed_at)}
                      </span>
                    ),
                  },
                ]}
                rows={sectionData.routines}
                rowKey={(r) => r.id}
                emptyMessage="No routines yet."
              />
            )}
          </div>
        )}

        {activeTab === "custom" && (
          <div className="space-y-4">
            <SectionHeader
              icon={<Dumbbell className="h-5 w-5" />}
              title="Custom exercises"
              subtitle={`${data.customExerciseCount} total`}
            />
            {sectionLoading && !sectionData && <Skeleton className="h-40 w-full" />}
            {sectionData?.section === "custom" && (
              <SupportSectionTable
                columns={[
                  { key: "name", header: "Name", render: (e) => e.display_name },
                  {
                    key: "active",
                    header: "Status",
                    render: (e) =>
                      e.active ? (
                        <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                          Active
                        </Badge>
                      ) : (
                        <Badge>Inactive</Badge>
                      ),
                  },
                  {
                    key: "updated",
                    header: "Updated",
                    render: (e) => (
                      <span className="text-xs text-zinc-600">{formatDate(e.updated_at)}</span>
                    ),
                  },
                ]}
                rows={sectionData.customExercises}
                rowKey={(e) => e.id}
                emptyMessage="No custom exercises yet."
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 font-semibold text-zinc-900">
        <span className="text-zinc-600">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {subtitle && <span>{subtitle}</span>}
        {badge && <Badge className="bg-zinc-900 capitalize text-white">{badge}</Badge>}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="font-medium text-zinc-500">{label}</dt>
      <dd className="text-zinc-800">{value}</dd>
    </>
  );
}
