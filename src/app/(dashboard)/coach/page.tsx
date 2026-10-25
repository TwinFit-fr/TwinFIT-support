"use client";

import { FormEvent, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { useIsAdmin } from "@/hooks/use-is-staff";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";

type Policy = {
  tierCode: string;
  monthlyTokenLimit: number | null;
  dailyBurstLimit: number | null;
  maxTurnTokens: number;
  minTurnTokens: number;
};
type LimitsResponse = { success?: boolean; policies?: Policy[]; error?: string };
type Draft = { monthly?: string; burst?: string };

const EDITABLE = ["trial", "premium", "premium_plus"] as const;

export default function CoachTokenLimitPage() {
  const isAdmin = useIsAdmin();
  if (!isAdmin) {
    return (
      <Card>
        <h1 className="text-lg font-semibold">Coach token budget</h1>
        <p className="mt-2 text-sm text-zinc-600">Only an admin can change the Coach token budget.</p>
      </Card>
    );
  }
  return <CoachTokenLimitEditor />;
}

function CoachTokenLimitEditor() {
  const { data, error, isLoading, mutate } = useStaffSWR<LimitsResponse>("/api/coach/token-limit");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const staffFetch = useStaffFetch();

  const policies = data?.policies ?? [];

  async function onSave(event: FormEvent, tierCode: string, monthly: string, burst: string) {
    event.preventDefault();
    setSaving(tierCode);
    setMessage(null);
    try {
      await staffFetch("/api/coach/token-limit", {
        method: "POST",
        // An empty daily cap means "no cap" (null).
        body: JSON.stringify({
          tierCode,
          monthlyTokenLimit: Number(monthly),
          dailyBurstLimit: burst.trim() === "" ? null : Number(burst),
        }),
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[tierCode];
        return next;
      });
      setMessage(`Saved ${tierCode}.`);
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Coach token budget</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Tokens (input + output + embeddings) a paid plan can spend on the Coach. The budget is per 30-day cycle that
          starts at the purchase; the daily cap keeps a user from spending the whole cycle in one UTC day. Freemium has
          no budget and never calls the model.
        </p>
      </div>
      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {message && <p className="text-sm text-zinc-700">{message}</p>}
      {EDITABLE.map((tierCode) => {
        const current = policies.find((policy) => policy.tierCode === tierCode);
        const draft = drafts[tierCode] ?? {};
        const monthly = draft.monthly ?? (current?.monthlyTokenLimit == null ? "" : String(current.monthlyTokenLimit));
        const burst = draft.burst ?? (current?.dailyBurstLimit == null ? "" : String(current.dailyBurstLimit));
        const setField = (field: keyof Draft, value: string) =>
          setDrafts((currentDrafts) => ({ ...currentDrafts, [tierCode]: { ...currentDrafts[tierCode], [field]: value } }));
        return (
          <Card key={tierCode}>
            <form className="flex flex-col gap-3" onSubmit={(event) => onSave(event, tierCode, monthly, burst)}>
              <h2 className="font-medium capitalize">{tierCode.replace("_", " ")}</h2>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Tokens per 30-day cycle
                <Input
                  inputMode="numeric"
                  value={monthly}
                  onChange={(event) => setField("monthly", event.target.value)}
                  aria-label={`${tierCode} tokens per cycle`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Tokens per UTC day (empty = no daily cap)
                <Input
                  inputMode="numeric"
                  value={burst}
                  onChange={(event) => setField("burst", event.target.value)}
                  aria-label={`${tierCode} tokens per day`}
                />
              </label>
              {current && (
                <p className="text-xs text-zinc-500">
                  One message holds up to {current.maxTurnTokens.toLocaleString()} tokens; a new one is refused below{" "}
                  {current.minTurnTokens.toLocaleString()} left (set in SQL).
                </p>
              )}
              <div>
                <Button type="submit" disabled={saving === tierCode || monthly.trim() === ""}>
                  {saving === tierCode ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </Card>
        );
      })}
    </div>
  );
}
