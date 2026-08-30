"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
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
  const [data, setData] = useState<SupportUserLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState("premium");
  const [expiresAt, setExpiresAt] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
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

  async function runAction(body: Record<string, unknown>) {
    setActionMessage(null);
    setActionLoading(true);
    try {
      await staffFetch("/api/support/actions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setActionMessage("Action completed.");
      setPendingAction(null);
      await load();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmPendingAction() {
    if (!data?.user || !pendingAction) return;
    const userId = data.user.id;

    if (pendingAction.type === "verify-email") {
      await runAction({ action: "verify-email", userId });
      return;
    }
    if (pendingAction.type === "set-subscription") {
      await runAction({
        action: "set-subscription",
        userId,
        tier: pendingAction.tier,
        expiresAt: pendingAction.expiresAt,
        provider: "manual",
      });
      return;
    }
    if (pendingAction.type === "set-disabled") {
      await runAction({
        action: "set-disabled",
        userId,
        disabled: pendingAction.disabled,
      });
    }
  }

  function confirmDialogContent(): { title: string; description: string; variant?: "default" | "danger" } | null {
    if (!data?.user || !pendingAction) return null;
    const userId = data.user.id;

    if (pendingAction.type === "verify-email") {
      return {
        title: "Verify email?",
        description: `Mark ${data.user.email} (${userId}) as email-verified.`,
      };
    }
    if (pendingAction.type === "set-subscription") {
      return {
        title: "Update subscription?",
        description: `Set tier to "${pendingAction.tier}"${
          pendingAction.expiresAt ? ` until ${pendingAction.expiresAt}` : ""
        } for ${data.user.email} (${userId}).`,
      };
    }
    return {
      title: pendingAction.disabled ? "Disable account?" : "Re-enable account?",
      description: `${pendingAction.disabled ? "Disable" : "Re-enable"} ${data.user.email} (${userId}).`,
      variant: "danger",
    };
  }

  const dialog = confirmDialogContent();

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading user…</p>;
  }

  if (error || !data?.user) {
    return (
      <div className="space-y-3">
        <Link href="/support" className="text-sm underline">
          Back to search
        </Link>
        <p className="text-sm text-red-600">{error ?? "User not found"}</p>
      </div>
    );
  }

  const userId = data.user.id;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/support" className="text-sm underline">
          Back to search
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{data.user.email}</h1>
        <p className="text-sm text-zinc-500">User ID: {userId}</p>
      </div>

      {actionMessage && <p className="text-sm text-emerald-700">{actionMessage}</p>}

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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-medium">Account</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-zinc-500">Email verified</dt>
            <dd>{data.user.emailVerified ? "Yes" : "No"}</dd>
            <dt className="text-zinc-500">Disabled</dt>
            <dd>{data.user.disabled ? "Yes" : "No"}</dd>
            <dt className="text-zinc-500">Username</dt>
            <dd>@{data.profile?.username ?? "—"}</dd>
            <dt className="text-zinc-500">Created</dt>
            <dd>{formatDate(data.user.createdAt)}</dd>
            <dt className="text-zinc-500">Last seen</dt>
            <dd>{data.user.lastSeen ? formatDate(data.user.lastSeen) : "—"}</dd>
          </dl>
          <div className="flex flex-wrap gap-2 pt-2">
            {!data.user.emailVerified && (
              <Button
                type="button"
                onClick={() => setPendingAction({ type: "verify-email" })}
              >
                Verify email
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
                {data.user.disabled ? "Re-enable account" : "Disable account"}
              </Button>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-medium">Subscription</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>{data.profile?.subscription_tier}</Badge>
            {data.profile?.subscription_tier_row?.routines_enabled && (
              <Badge>Routines</Badge>
            )}
            {data.profile?.subscription_tier_row?.support_enabled && (
              <Badge>Support channel</Badge>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-zinc-500">Expires</dt>
            <dd>
              {data.profile?.subscription_expires_at
                ? formatDate(data.profile.subscription_expires_at)
                : "—"}
            </dd>
            <dt className="text-zinc-500">Provider</dt>
            <dd>{data.profile?.subscription_provider ?? "—"}</dd>
            <dt className="text-zinc-500">External ID</dt>
            <dd className="break-all">{data.profile?.subscription_external_id ?? "—"}</dd>
          </dl>
          <div className="space-y-2 border-t border-zinc-100 pt-3">
            <label className="text-sm font-medium">Set tier</label>
            <select
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
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
              placeholder="Expiry (optional)"
            />
            <Button
              type="button"
              onClick={() =>
                setPendingAction({
                  type: "set-subscription",
                  tier,
                  expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
                })
              }
            >
              Update subscription
            </Button>
          </div>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="font-medium">Activity</h2>
        <p className="text-sm text-zinc-600">
          {data.finishedSessions} finished sessions · {data.templateCount} templates
          {data.openSession
            ? ` · open session "${data.openSession.name}" since ${formatDate(data.openSession.started_at)}`
            : ""}
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="py-2 pr-4">Session</th>
                <th className="py-2 pr-4">Started</th>
                <th className="py-2 pr-4">Sets</th>
                <th className="py-2">Tonnage</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSessions.map((session) => (
                <tr key={session.session_id} className="border-b border-zinc-100">
                  <td className="py-2 pr-4">{session.name}</td>
                  <td className="py-2 pr-4">{formatDate(session.started_at)}</td>
                  <td className="py-2 pr-4">{session.total_sets ?? "—"}</td>
                  <td className="py-2">{session.session_tonnage_kg ?? "—"}</td>
                </tr>
              ))}
              {data.recentSessions.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-zinc-500">
                    No recent sessions.
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
  return new Date(value).toLocaleString();
}
