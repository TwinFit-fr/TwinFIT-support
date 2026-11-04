"use client";

import { FormEvent, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { useIsAdmin } from "@/hooks/use-is-staff";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";

type Policy = {
  tierCode: string;
  monthlyTokenLimit: number | null;
  weeklyTokenLimit: number | null;
  hourlyBurstLimit: number | null;
  maxTurnTokens: number;
  minTurnTokens: number;
};
type LimitsResponse = { success?: boolean; policies?: Policy[]; error?: string };
type Field = "monthly" | "weekly" | "hourly";
type Draft = Partial<Record<Field, string>>;

const EDITABLE = ["premium"] as const;

/**
 * Bounds of `admin-set-coach-token-limit` (API_FUNCTIONS_CONTRACT). The cycle budget cannot be null
 * there (null = no Coach model is set in SQL); the weekly and hourly caps can (null = no cap).
 */
const FIELDS: { field: Field; key: keyof Policy; label: string; aria: string; max: number; nullable: boolean }[] = [
  { field: "monthly", key: "monthlyTokenLimit", label: "Tokens per 30-day cycle", aria: "tokens per cycle", max: 100_000_000, nullable: false },
  { field: "weekly", key: "weeklyTokenLimit", label: "Tokens per rolling 7 days (empty = no weekly cap)", aria: "tokens per week", max: 100_000_000, nullable: true },
  { field: "hourly", key: "hourlyBurstLimit", label: "Tokens per rolling 60 minutes (empty = no hourly cap)", aria: "tokens per hour", max: 10_000_000, nullable: true },
];

/** Empty → null when the field allows it; otherwise a whole number in [0, max], or undefined when it is not one. */
function parseLimit(text: string, max: number, nullable: boolean): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return nullable ? null : undefined;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value <= max ? value : undefined;
}

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

  async function onSave(event: FormEvent, tierCode: string, values: Record<Field, string>) {
    event.preventDefault();
    const parsed = {} as Record<Field, number | null>;
    for (const { field, aria, max, nullable } of FIELDS) {
      const value = parseLimit(values[field], max, nullable);
      if (value === undefined) {
        const name = aria.charAt(0).toUpperCase() + aria.slice(1);
        setMessage(`${name}: a whole number from 0 to ${max.toLocaleString()}${nullable ? ", or empty" : ""}.`);
        return;
      }
      parsed[field] = value;
    }
    const { monthly, weekly, hourly } = parsed;
    setSaving(tierCode);
    setMessage(null);
    try {
      await staffFetch("/api/coach/token-limit", {
        method: "POST",
        body: JSON.stringify({
          tierCode,
          monthlyTokenLimit: monthly,
          weeklyTokenLimit: weekly,
          hourlyBurstLimit: hourly,
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
          starts at the purchase; the weekly and hourly caps count the last 7 days and the last 60 minutes, so a user
          cannot spend the whole cycle at once. A message needs every limit to have room. Freemium has no budget and
          never calls the model.
        </p>
      </div>
      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {message && <p className="text-sm text-zinc-700">{message}</p>}
      {EDITABLE.map((tierCode) => {
        const current = policies.find((policy) => policy.tierCode === tierCode);
        const draft = drafts[tierCode] ?? {};
        const valueOf = (field: Field, key: keyof Policy) => {
          const stored = current?.[key];
          return draft[field] ?? (stored == null ? "" : String(stored));
        };
        const values = Object.fromEntries(FIELDS.map(({ field, key }) => [field, valueOf(field, key)])) as Record<
          Field,
          string
        >;
        const setField = (field: Field, value: string) =>
          setDrafts((currentDrafts) => ({ ...currentDrafts, [tierCode]: { ...currentDrafts[tierCode], [field]: value } }));
        return (
          <Card key={tierCode}>
            <form className="flex flex-col gap-3" onSubmit={(event) => onSave(event, tierCode, values)}>
              <h2 className="font-medium capitalize">{tierCode.replace("_", " ")}</h2>
              {FIELDS.map(({ field, label, aria }) => (
                <label key={field} className="flex flex-col gap-1 text-xs text-zinc-500">
                  {label}
                  <Input
                    inputMode="numeric"
                    value={values[field]}
                    onChange={(event) => setField(field, event.target.value)}
                    aria-label={`${tierCode} ${aria}`}
                  />
                </label>
              ))}
              {current && (
                <p className="text-xs text-zinc-500">
                  One message holds up to {current.maxTurnTokens.toLocaleString()} tokens; a new one is refused below{" "}
                  {current.minTurnTokens.toLocaleString()} left in the cycle, the week or the hour (set in SQL).
                </p>
              )}
              <div>
                <Button type="submit" disabled={saving === tierCode}>
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
