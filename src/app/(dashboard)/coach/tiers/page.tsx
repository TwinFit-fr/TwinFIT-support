"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import type { TierPolicy } from "@/lib/coach/types";

type Response = { policies?: TierPolicy[]; error?: string };

type Draft = {
  personal_data_enabled: boolean;
  plan_builder_enabled: boolean;
  max_tool_rounds: number;
};

export default function CoachTiersPage() {
  const staffFetch = useStaffFetch();
  const { data, error, isLoading, mutate } = useStaffSWR<Response>("/api/coach/tiers");
  const policies = useMemo(() => data?.policies ?? [], [data?.policies]);
  const [overrides, setOverrides] = useState<Record<string, Partial<Draft>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  function draftFor(policy: TierPolicy): Draft {
    const patch = overrides[policy.tier_code] ?? {};
    return {
      personal_data_enabled: patch.personal_data_enabled ?? policy.personal_data_enabled,
      plan_builder_enabled: patch.plan_builder_enabled ?? policy.plan_builder_enabled,
      max_tool_rounds: patch.max_tool_rounds ?? policy.max_tool_rounds,
    };
  }

  function patchDraft(tierCode: string, patch: Partial<Draft>) {
    setOverrides((current) => ({
      ...current,
      [tierCode]: { ...current[tierCode], ...patch },
    }));
  }

  async function onSave(event: FormEvent, policy: TierPolicy) {
    event.preventDefault();
    const draft = draftFor(policy);
    setSaving(policy.tier_code);
    setMessage(null);
    try {
      await staffFetch("/api/coach/tiers", {
        method: "POST",
        body: JSON.stringify({ tier_code: policy.tier_code, ...draft }),
      });
      setOverrides((current) => {
        const next = { ...current };
        delete next[policy.tier_code];
        return next;
      });
      setMessage(`Saved ${policy.tier_code}.`);
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Coach tier policies</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Staff can edit capabilities. Token budgets are read-only here; admins change monthly and
          daily limits under Token budget.
        </p>
      </div>

      {(message || error) && (
        <p className="text-sm text-zinc-700">{message ?? error?.message}</p>
      )}
      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}

      <div className="space-y-3">
        {policies.map((policy) => {
          const draft = draftFor(policy);
          return (
            <Card key={policy.tier_code}>
              <form className="space-y-3" onSubmit={(event) => onSave(event, policy)}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-medium">{policy.tier_code}</h2>
                  <Button type="submit" disabled={saving === policy.tier_code}>
                    {saving === policy.tier_code ? "Saving…" : "Save"}
                  </Button>
                </div>

                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.personal_data_enabled}
                      onChange={(event) =>
                        patchDraft(policy.tier_code, {
                          personal_data_enabled: event.target.checked,
                        })
                      }
                    />
                    Personal data tools
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.plan_builder_enabled}
                      onChange={(event) =>
                        patchDraft(policy.tier_code, {
                          plan_builder_enabled: event.target.checked,
                        })
                      }
                    />
                    Plan builder tools
                  </label>
                </div>

                <label className="block max-w-xs text-sm">
                  <span className="mb-1 block text-zinc-500">Max tool rounds (1–8)</span>
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={draft.max_tool_rounds}
                    onChange={(event) =>
                      patchDraft(policy.tier_code, {
                        max_tool_rounds: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <dl className="grid gap-2 rounded-md bg-zinc-50 p-3 text-xs text-zinc-600 sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-zinc-500">Monthly token limit</dt>
                    <dd>{policy.monthly_token_limit ?? "null (no LLM)"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Daily burst limit</dt>
                    <dd>{policy.daily_burst_limit ?? "null (no cap)"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Max turn tokens</dt>
                    <dd>{policy.max_turn_tokens}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Min turn tokens</dt>
                    <dd>{policy.min_turn_tokens}</dd>
                  </div>
                </dl>
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
