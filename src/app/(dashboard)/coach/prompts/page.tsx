"use client";

import { FormEvent, useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  LOCALES,
  PROMPT_BODY_MAX,
  PROMPT_KEYS,
  type PromptVersion,
} from "@/lib/coach/types";

type Response = { versions?: PromptVersion[]; error?: string };

const textareaClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400";

export default function CoachPromptsPage() {
  const staffFetch = useStaffFetch();
  const { data, error, isLoading, mutate } = useStaffSWR<Response>("/api/coach/prompts");
  const [keyFilter, setKeyFilter] = useState<string>(PROMPT_KEYS[0]);
  const [localeFilter, setLocaleFilter] = useState<string>("en");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const versions = data?.versions ?? [];
    return versions.filter(
      (row) =>
        (!keyFilter || row.prompt_key === keyFilter) &&
        (!localeFilter || row.locale === localeFilter),
    );
  }, [data?.versions, keyFilter, localeFilter]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await staffFetch("/api/coach/prompts", {
        method: "POST",
        body: JSON.stringify({
          prompt_key: keyFilter,
          locale: localeFilter,
          body_md: body,
        }),
      });
      setBody("");
      setMessage("Version created (inactive). Activate it when ready.");
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string, activate: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await staffFetch("/api/coach/prompts", {
        method: "POST",
        body: JSON.stringify({
          action: activate ? "activate" : "deactivate",
          id,
        }),
      });
      setMessage(activate ? "Activated." : "Deactivated.");
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Coach prompt versions</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Append-only versions per key and locale. New rows start inactive. The last active{" "}
          <code className="text-xs">en</code> version of a key cannot be deactivated.
        </p>
      </div>

      {(message || error) && (
        <p className="text-sm text-zinc-700">{message ?? error?.message}</p>
      )}

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-zinc-500">Key</span>
            <select
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={keyFilter}
              onChange={(event) => setKeyFilter(event.target.value)}
            >
              {PROMPT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-zinc-500">Locale</span>
            <select
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={localeFilter}
              onChange={(event) => setLocaleFilter(event.target.value)}
            >
              {LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </select>
          </label>
        </div>

        <form onSubmit={onCreate} className="space-y-2">
          <label className="block text-sm">
            <span className="mb-1 flex justify-between text-zinc-500">
              <span>New version body</span>
              <span>
                {body.length}/{PROMPT_BODY_MAX}
              </span>
            </span>
            <textarea
              className={textareaClass}
              rows={8}
              value={body}
              maxLength={PROMPT_BODY_MAX}
              onChange={(event) => setBody(event.target.value)}
              required
            />
          </label>
          <Button type="submit" disabled={busy || !body.trim()}>
            Add inactive version
          </Button>
        </form>
      </Card>

      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}

      <div className="space-y-3">
        {filtered.map((row) => (
          <Card key={row.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>v{row.version}</Badge>
              {row.is_active ? (
                <Badge className="bg-emerald-100 text-emerald-800">active</Badge>
              ) : (
                <Badge>inactive</Badge>
              )}
              <span className="text-xs text-zinc-500">
                {new Date(row.created_at).toLocaleString()}
              </span>
              <div className="ml-auto flex gap-2">
                {row.is_active ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setActive(row.id, false)}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button type="button" disabled={busy} onClick={() => setActive(row.id, true)}>
                    Activate
                  </Button>
                )}
              </div>
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-xs text-zinc-800">
              {row.body_md}
            </pre>
          </Card>
        ))}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-zinc-500">No versions for this key and locale.</p>
        )}
      </div>
    </div>
  );
}
