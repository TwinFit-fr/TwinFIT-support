"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  User,
  Shield,
  CreditCard,
  Activity,
  CheckCircle,
  Ban,
  Clock,
  Dumbbell,
  RefreshCw,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge, Button, Card, Input, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useIsAdmin } from "@/hooks/use-is-staff";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import type { SupportUserLookup } from "@/lib/support/types";

type PendingAction =
  | { type: "verify-email" }
  | { type: "set-subscription"; tier: string; expiresAt: string | null }
  | { type: "set-disabled"; disabled: boolean };

export default function SupportUserPage() {
  const params = useParams<{ userId: string }>();
  const staffFetch = useStaffFetch();
  const isAdmin = useIsAdmin();
  const toast = useToast();

  const [data, setData] = useState<SupportUserLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState("premium");
  const [expiresAt, setExpiresAt] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = (await staffFetch(
        `/api/support/lookup?q=${encodeURIComponent(params.userId)}`,
      )) as SupportUserLookup;
      setData(result);
      setTier(result.profile?.subscription_tier ?? "free");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user");
    } finally {
      setLoading(false);
    }
  }, [staffFetch, params.userId]);

  useEffect(() => {
    void load();
  }, [load]);

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
        {
          action: "set-disabled",
          userId,
          disabled: pendingAction.disabled,
        },
        pendingAction.disabled ? "Account disabled" : "Account re-enabled",
      );
    }
  }

  function confirmDialogContent(): { title: string; description: string; variant?: "default" | "danger" } | null {
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
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6 space-y-4">
            <Skeleton className="h-6 w-28" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </Card>
          <Card className="p-6 space-y-4">
            <Skeleton className="h-6 w-28" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </Card>
        </div>
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
        <p className="text-sm text-red-600 bg-red-50 p-4 rounded-xl border border-red-200">
          {error ?? "User not found"}
        </p>
      </div>
    );
  }

  const userId = data.user.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/support"
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 mb-2 font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to support search
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{data.user.email}</h1>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">User ID: {userId}</p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account Details */}
        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-2 font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
            <User className="h-5 w-5 text-zinc-600" />
            <span>Account Details</span>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-zinc-500 font-medium">Username</dt>
            <dd className="font-semibold text-zinc-800">
              @{data.profile?.username ?? "—"}
            </dd>

            <dt className="text-zinc-500 font-medium">Email Verified</dt>
            <dd>
              {data.user.emailVerified ? (
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Verified
                </Badge>
              ) : (
                <Badge className="bg-amber-50 text-amber-700 border border-amber-200">
                  Unverified
                </Badge>
              )}
            </dd>

            <dt className="text-zinc-500 font-medium">Account Status</dt>
            <dd>
              {data.user.disabled ? (
                <Badge className="bg-red-50 text-red-700 border border-red-200">
                  Disabled
                </Badge>
              ) : (
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Active
                </Badge>
              )}
            </dd>

            <dt className="text-zinc-500 font-medium">Registration Date</dt>
            <dd className="text-zinc-700">{formatDate(data.user.createdAt)}</dd>

            <dt className="text-zinc-500 font-medium">Last Activity</dt>
            <dd className="text-zinc-700">
              {data.user.lastSeen ? formatDate(data.user.lastSeen) : "—"}
            </dd>
          </dl>

          <div className="flex flex-wrap gap-2 pt-3 border-t border-zinc-100">
            {!data.user.emailVerified && (
              <Button
                type="button"
                onClick={() => setPendingAction({ type: "verify-email" })}
              >
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
        </Card>

        {/* Subscription Info */}
        <Card className="space-y-4 p-6">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2 font-semibold text-zinc-900">
              <CreditCard className="h-5 w-5 text-zinc-600" />
              <span>Subscription & Entitlements</span>
            </div>
            <Badge className="bg-zinc-900 text-white capitalize">
              {data.profile?.subscription_tier ?? "free"}
            </Badge>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-zinc-500 font-medium">Expiration Date</dt>
            <dd className="text-zinc-700 font-medium">
              {data.profile?.subscription_expires_at
                ? formatDate(data.profile.subscription_expires_at)
                : "Lifetime / No expiry"}
            </dd>

            <dt className="text-zinc-500 font-medium">Payment Provider</dt>
            <dd className="text-zinc-700 capitalize">
              {data.profile?.subscription_provider ?? "manual"}
            </dd>

            <dt className="text-zinc-500 font-medium">External ID</dt>
            <dd className="text-zinc-700 font-mono text-xs break-all">
              {data.profile?.subscription_external_id ?? "—"}
            </dd>
          </dl>

          <div className="space-y-3 border-t border-zinc-100 pt-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 block">
              Admin Tier Override
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
              className="w-full"
            >
              Update subscription
            </Button>
          </div>
        </Card>
      </div>

      {/* Activity Overview */}
      <Card className="space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-2 font-semibold text-zinc-900">
            <Activity className="h-5 w-5 text-zinc-600" />
            <span>Activity History</span>
          </div>
          <div className="text-xs text-zinc-500">
            <strong>{data.finishedSessions}</strong> finished workouts ·{" "}
            <strong>{data.templateCount}</strong> workout templates
          </div>
        </div>

        {data.openSession && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  Live Session: &quot;{data.openSession.name}&quot;
                </p>
                <p className="text-xs text-emerald-700">
                  Started at {formatDate(data.openSession.started_at)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm divide-y divide-zinc-200">
            <thead className="bg-zinc-50/70 text-xs font-semibold uppercase text-zinc-500 tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Workout Name</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Total Sets</th>
                <th className="py-2.5 px-3">Total Tonnage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.recentSessions.map((session) => (
                <tr key={session.session_id} className="hover:bg-zinc-50/50">
                  <td className="py-3 px-3 font-medium text-zinc-900">{session.name}</td>
                  <td className="py-3 px-3 text-zinc-600 text-xs">{formatDate(session.started_at)}</td>
                  <td className="py-3 px-3 text-zinc-700 font-mono">{session.total_sets ?? "—"}</td>
                  <td className="py-3 px-3 text-zinc-700 font-mono">
                    {session.session_tonnage_kg ? `${session.session_tonnage_kg.toLocaleString()} kg` : "—"}
                  </td>
                </tr>
              ))}
              {data.recentSessions.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-zinc-500 text-xs">
                    No workout sessions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
