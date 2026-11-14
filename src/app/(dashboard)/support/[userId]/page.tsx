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
  MessageSquare,
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
  SupportUserCoachQuota,
  SupportUserLookup,
  SupportUserSectionData,
} from "@/lib/support/types";

type PendingAction =
  | { type: "verify-email" }
  | { type: "grant-premium"; reason: string; endsAt: string | null }
  | { type: "revoke-premium" }
  | { type: "set-disabled"; disabled: boolean };

const SECTION_BY_TAB: Partial<Record<SupportUserTabId, SupportUserSectionData["section"]>> = {
  sessions: "sessions",
  templates: "templates",
  routines: "routines",
  custom: "custom",
  coach: "coach",
};

function formatTokens(value: number): string {
  return value.toLocaleString();
}

function periodSpent(row: {
  input_tokens: number;
  output_tokens: number;
  embed_tokens: number;
}): number {
  return row.input_tokens + row.output_tokens + row.embed_tokens;
}

/** Percent of limit used; null when there is no limit (e.g. free / no LLM). */
function usagePercent(used: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) return null;
  return Math.min(999, (used / limit) * 100);
}

function formatPercent(used: number, limit: number | null): string {
  const pct = usagePercent(used, limit);
  if (pct == null) return "—";
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

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
  const [grantEndsAt, setGrantEndsAt] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    await mutate();
  }

  async function runAction(body: Record<string, unknown>, successMessage: string): Promise<boolean> {
    setActionLoading(true);
    try {
      await staffFetch("/api/support/actions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success(successMessage);
      setPendingAction(null);
      await load();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
      return false;
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
    if (pendingAction.type === "grant-premium") {
      const granted = await runAction(
        {
          action: "grant-premium",
          userId,
          reason: pendingAction.reason,
          endsAt: pendingAction.endsAt,
        },
        "Premium granted",
      );
      if (granted) {
        setGrantEndsAt("");
        setGrantReason("");
      }
      return;
    }
    if (pendingAction.type === "revoke-premium") {
      await runAction({ action: "revoke-premium", userId }, "Support grants revoked");
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
    if (pendingAction.type === "grant-premium") {
      return {
        title: "Grant Premium?",
        description: `Give ${data.user.email} Premium ${
          pendingAction.endsAt ? `until ${formatDate(pendingAction.endsAt)}` : "with no end date"
        }. A Google Play subscription is not changed.`,
      };
    }
    if (pendingAction.type === "revoke-premium") {
      return {
        title: "Revoke Support grants?",
        description: `End every running Support grant of ${data.user.email}. A Google Play subscription keeps its Premium.`,
        variant: "danger",
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
  const tierRow = data.tier;
  const entitlement = profile?.entitlement ?? null;
  const effectiveTier = profile?.effective_subscription_tier ?? "free";
  const hasRunningGrant = data.grants.some((grant) => grant.status === "running");

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
                  label="Training days / week"
                  value={profile?.sessions_per_week != null ? String(profile.sessions_per_week) : "—"}
                />
                <Field label="Hypertrophy" value={profile?.hypertrophy_level ?? "—"} />
                <Field label="Strength" value={profile?.strength_level ?? "—"} />
                <Field label="Endurance" value={profile?.endurance_level ?? "—"} />
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
                title="Plan & entitlements"
                badge={effectiveTier}
              />
              <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-3">
                <Field label="Tier" value={tierRow?.display_name ?? effectiveTier} />
                <Field label="Source" value={sourceLabel(entitlement?.source)} />
                <Field
                  label="Ends"
                  value={
                    entitlement?.source && entitlement.source !== "none"
                      ? entitlement.expires_at
                        ? formatDate(entitlement.expires_at)
                        : "No end date"
                      : "—"
                  }
                />
                <Field
                  label="Plan started"
                  value={formatDate(entitlement?.period_started_at)}
                />
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
              </dl>

              {entitlement?.play_state && (
                <div className="space-y-2 border-t border-zinc-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    Google Play
                  </p>
                  <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-3">
                    <Field label="State" value={playStateLabel(entitlement.play_state)} />
                    <Field
                      label="Plan"
                      value={[entitlement.play_product_id, entitlement.play_base_plan_id]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    />
                    <Field
                      label={entitlement.play_auto_renewing ? "Renews" : "Access ends"}
                      value={formatDate(entitlement.play_expiry_time)}
                    />
                    <Field
                      label="Auto-renew"
                      value={entitlement.play_auto_renewing ? "On" : "Off"}
                    />
                    <Field
                      label="Free trial"
                      value={entitlement.play_in_free_trial ? "Yes" : "No"}
                    />
                    <Field
                      label="Purchase token"
                      value={
                        <span className="break-all font-mono text-xs">
                          {entitlement.play_purchase_token ?? "—"}
                        </span>
                      }
                    />
                  </dl>
                </div>
              )}

              <div className="space-y-3 border-t border-zinc-100 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Support grants
                </p>
                {data.grants.length === 0 ? (
                  <p className="text-sm text-zinc-500">No Support grant.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {data.grants.map((grant) => (
                      <li
                        key={grant.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                      >
                        <span className="text-zinc-800">
                          <span className="capitalize">{grant.tier_code}</span>
                          {" · "}
                          {grant.ends_at ? `until ${formatDate(grant.ends_at)}` : "no end date"}
                          {" · "}
                          <span className="text-zinc-500">{grant.reason}</span>
                        </span>
                        <span className="text-xs text-zinc-500">
                          {grant.revoked_at ? `revoked ${formatDate(grant.revoked_at)}` : grant.status} · granted {formatDate(grant.inserted_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-3 border-t border-zinc-100 pt-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Grant Premium
                </label>
                <p className="text-xs text-zinc-500">
                  Premium until the end date (no end when empty). The plan is the best of the
                  Google Play subscription and the Support grants; neither changes the other.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Reason (required)"
                    value={grantReason}
                    onChange={(e) => setGrantReason(e.target.value)}
                  />
                  <Input
                    type="datetime-local"
                    aria-label="Premium end date"
                    value={grantEndsAt}
                    onChange={(e) => setGrantEndsAt(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    disabled={grantReason.trim() === ""}
                    onClick={() =>
                      setPendingAction({
                        type: "grant-premium",
                        reason: grantReason.trim(),
                        endsAt: grantEndsAt ? new Date(grantEndsAt).toISOString() : null,
                      })
                    }
                    className="w-full sm:w-auto"
                  >
                    Grant Premium
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!hasRunningGrant}
                    onClick={() => setPendingAction({ type: "revoke-premium" })}
                    className="w-full sm:w-auto"
                  >
                    Revoke Support grants
                  </Button>
                </div>
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

        {activeTab === "coach" && (
          <div className="space-y-4">
            <SectionHeader
              icon={<MessageSquare className="h-5 w-5" />}
              title="Coach usage"
              subtitle="30-day cycles, weekly and hourly limits (read-only)"
              badge={
                sectionData?.section === "coach" ? sectionData.tierCode : undefined
              }
            />
            {sectionLoading && !sectionData && <Skeleton className="h-40 w-full" />}
            {sectionData?.section === "coach" && (
              <CoachUsagePanel data={sectionData} />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function CoachUsagePanel({
  data,
}: {
  data: Extract<SupportUserSectionData, { section: "coach" }>;
}) {
  const [now] = useState(() => Date.now());
  const openPeriod =
    data.periods.find((p) => {
      const start = new Date(p.period_start).getTime();
      const end = new Date(p.period_end).getTime();
      return start <= now && now < end;
    }) ?? null;
  const openSpent = openPeriod ? periodSpent(openPeriod) : 0;
  const quota = data.quota;
  const llmEnabled = quota ? quota.llm_enabled : data.monthlyTokenLimit != null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QuickStat
          label="Period used"
          value={
            data.monthlyTokenLimit == null
              ? "No LLM"
              : `${formatTokens(openSpent)} / ${formatTokens(data.monthlyTokenLimit)}`
          }
        />
        <QuickStat
          label="Period left"
          value={
            data.monthlyTokenLimit == null
              ? "No LLM"
              : formatTokens(Math.max(0, data.monthlyTokenLimit - openSpent))
          }
          hint={
            data.monthlyTokenLimit == null
              ? undefined
              : `${formatPercent(openSpent, data.monthlyTokenLimit)} used`
          }
        />
        <QuickStat
          label="Period ends"
          value={openPeriod ? formatDate(openPeriod.period_end) : "—"}
          hint={openPeriod ? undefined : "No open cycle; the next message starts one."}
        />
        <RollingLimitStat
          label="Week used"
          span="Rolling 7 days"
          limit={quota ? quota.week_limit : data.weeklyTokenLimit}
          used={quota?.week_used ?? null}
          remaining={quota?.week_remaining ?? null}
          llmEnabled={llmEnabled}
        />
        <RollingLimitStat
          label="Hour used"
          span="Rolling 60 minutes"
          limit={quota ? quota.hour_limit : data.hourlyBurstLimit}
          used={quota?.hour_used ?? null}
          remaining={quota?.hour_remaining ?? null}
          llmEnabled={llmEnabled}
        />
        <BindingLimitStat quota={quota} llmEnabled={llmEnabled} />
      </div>
      <SupportSectionTable
        columns={[
          {
            key: "period",
            header: "Cycle",
            render: (p) => {
              const start = new Date(p.period_start).getTime();
              const end = new Date(p.period_end).getTime();
              const open = start <= now && now < end;
              return (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-600">
                    {formatDate(p.period_start)} → {formatDate(p.period_end)}
                  </span>
                  {open && (
                    <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                      Open
                    </Badge>
                  )}
                </div>
              );
            },
          },
          {
            key: "spent",
            header: "Spent",
            render: (p) => {
              const spent = periodSpent(p);
              const limit = data.monthlyTokenLimit;
              return (
                <span>
                  {formatTokens(spent)}
                  {limit != null ? ` / ${formatTokens(limit)}` : ""}
                </span>
              );
            },
          },
          {
            key: "pct",
            header: "Period %",
            render: (p) => formatPercent(periodSpent(p), data.monthlyTokenLimit),
          },
          {
            key: "input",
            header: "Input",
            render: (p) => formatTokens(p.input_tokens),
          },
          {
            key: "output",
            header: "Output",
            render: (p) => formatTokens(p.output_tokens),
          },
          {
            key: "embed",
            header: "Embed",
            render: (p) => formatTokens(p.embed_tokens),
          },
          {
            key: "reserved",
            header: "Reserved",
            render: (p) => formatTokens(p.reserved_tokens),
          },
        ]}
        rows={data.periods}
        rowKey={(p) => `${p.user_id}:${p.period_start}`}
        emptyMessage="No Coach usage periods yet (no LLM turns recorded)."
      />
    </>
  );
}

function QuickStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
}

/** Week / hour usage from the user's quota; "—" used when the backend has no quota row. */
function RollingLimitStat({
  label,
  span,
  limit,
  used,
  remaining,
  llmEnabled,
}: {
  label: string;
  span: string;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  llmEnabled: boolean;
}) {
  if (!llmEnabled) return <QuickStat label={label} value="No LLM" />;
  if (limit == null) return <QuickStat label={label} value="No cap" hint={span} />;
  if (used == null) {
    return <QuickStat label={label} value={`— / ${formatTokens(limit)}`} hint={`${span}. No quota for this user.`} />;
  }
  return (
    <QuickStat
      label={label}
      value={`${formatTokens(used)} / ${formatTokens(limit)}`}
      hint={remaining == null ? span : `${formatTokens(remaining)} left · ${span.toLowerCase()}`}
    />
  );
}

const SCOPE_LABEL: Record<NonNullable<SupportUserCoachQuota["scope"]>, string> = {
  period: "Period",
  week: "Week",
  hour: "Hour",
};

/** The limit that binds now (`scope`), what is left of it and when it frees up (`resets_at`). */
function BindingLimitStat({
  quota,
  llmEnabled,
}: {
  quota: SupportUserCoachQuota | null;
  llmEnabled: boolean;
}) {
  const label = "Binding limit";
  if (!llmEnabled) return <QuickStat label={label} value="No LLM" />;
  if (!quota || !quota.scope) return <QuickStat label={label} value="—" hint="No quota for this user." />;
  const left = quota.remaining == null ? "" : ` · ${formatTokens(Math.max(0, quota.remaining))} left`;
  return (
    <QuickStat
      label={label}
      value={`${SCOPE_LABEL[quota.scope]}${left}`}
      hint={quota.resets_at ? `Frees up ${formatDate(quota.resets_at)}` : undefined}
    />
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

function sourceLabel(source: string | null | undefined): string {
  if (source === "google_play") return "Google Play";
  if (source === "manual") return "Support grant";
  return "None";
}

/** `SUBSCRIPTION_STATE_IN_GRACE_PERIOD` → `In grace period`. */
function playStateLabel(state: string): string {
  const words = state.replace(/^SUBSCRIPTION_STATE_/, "").toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="font-medium text-zinc-500">{label}</dt>
      <dd className="text-zinc-800">{value}</dd>
    </>
  );
}
