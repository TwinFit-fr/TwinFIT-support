"use client";

import { FormEvent, useMemo, useState } from "react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import type { TurnToolCall } from "@/lib/coach/types";

type Response = {
  calls?: TurnToolCall[];
  tools?: string[];
  error?: string;
};

export default function CoachToolCallsPage() {
  const [tool, setTool] = useState("");
  const [zeroResult, setZeroResult] = useState<"any" | "true" | "false">("any");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [applied, setApplied] = useState({
    tool: "",
    zeroResult: "any" as "any" | "true" | "false",
    since: "",
    until: "",
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.tool) params.set("tool", applied.tool);
    if (applied.zeroResult !== "any") params.set("zero_result", applied.zeroResult);
    if (applied.since) params.set("since", new Date(applied.since).toISOString());
    if (applied.until) params.set("until", new Date(applied.until).toISOString());
    params.set("limit", "150");
    return `/api/coach/tool-calls?${params.toString()}`;
  }, [applied]);

  const { data, error, isLoading, mutate } = useStaffSWR<Response>(query);
  const calls = data?.calls ?? [];
  const tools = data?.tools ?? [];

  function onFilter(event: FormEvent) {
    event.preventDefault();
    setApplied({ tool, zeroResult, since, until });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Coach tool-call log</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Read-only audit of <code className="text-xs">assistant_turn_tool_calls</code>. No writes.
        </p>
      </div>

      {error && <p className="text-sm text-zinc-700">{error.message}</p>}

      <Card>
        <form className="flex flex-wrap items-end gap-3" onSubmit={onFilter}>
          <label className="text-sm">
            <span className="mb-1 block text-zinc-500">Tool</span>
            <select
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={tool}
              onChange={(event) => setTool(event.target.value)}
            >
              <option value="">Any</option>
              {tools.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-zinc-500">Zero result</span>
            <select
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={zeroResult}
              onChange={(event) => setZeroResult(event.target.value as "any" | "true" | "false")}
            >
              <option value="any">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-zinc-500">Since</span>
            <Input
              type="datetime-local"
              value={since}
              onChange={(event) => setSince(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-zinc-500">Until</span>
            <Input
              type="datetime-local"
              value={until}
              onChange={(event) => setUntil(event.target.value)}
            />
          </label>
          <Button type="submit">Filter</Button>
          <Button type="button" variant="secondary" onClick={() => mutate()}>
            Refresh
          </Button>
        </form>
      </Card>

      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}

      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Tool</th>
              <th className="px-3 py-2">Hits</th>
              <th className="px-3 py-2">Top sim</th>
              <th className="px-3 py-2">Zero</th>
              <th className="px-3 py-2">ms</th>
              <th className="px-3 py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((row) => (
              <tr key={row.id} className="border-b border-zinc-100 align-top">
                <td className="px-3 py-2 whitespace-nowrap text-xs text-zinc-500">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{row.tool}</div>
                  <div className="text-xs text-zinc-500">
                    round {row.round} · pos {row.position}
                  </div>
                </td>
                <td className="px-3 py-2">{row.hits ?? "—"}</td>
                <td className="px-3 py-2">
                  {row.top_similarity == null ? "—" : row.top_similarity.toFixed(3)}
                </td>
                <td className="px-3 py-2">
                  {row.zero_result ? (
                    <Badge className="bg-amber-100 text-amber-800">yes</Badge>
                  ) : (
                    "no"
                  )}
                </td>
                <td className="px-3 py-2">{row.ms ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">{row.error_code ?? ""}</td>
              </tr>
            ))}
            {!isLoading && calls.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-sm text-zinc-500" colSpan={7}>
                  No tool calls match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
