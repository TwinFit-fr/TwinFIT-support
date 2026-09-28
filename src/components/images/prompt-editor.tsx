"use client";

import { useEffect, useMemo, useState } from "react";
import { mutate } from "swr";
import { Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { assembleImagePrompt } from "@/lib/images/prompt";
import type { ImagePrompt, ImagePromptKind } from "@/lib/images/types";

type PromptsResponse = {
  system: ImagePrompt[];
  exercise: ImagePrompt[];
};

type ListResponse = {
  exercises: { exo_id: number; display_name: string; description: string | null }[];
};

function PromptEditorPanel({
  kind,
  prompts,
}: {
  kind: ImagePromptKind;
  prompts: ImagePrompt[];
}) {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const [selectedId, setSelectedId] = useState(prompts.find((p) => p.is_default)?.id ?? prompts[0]?.id ?? "");
  const selected = prompts.find((p) => p.id === selectedId) ?? prompts[0] ?? null;
  const [name, setName] = useState(selected?.name ?? "");
  const [content, setContent] = useState(selected?.content ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setContent(selected.content);
  }, [selected]);

  async function refresh() {
    await mutate("/api/images/prompts");
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      await staffFetch(`/api/images/prompts/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, content }),
      });
      success("Prompt saved");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const customName = window.prompt(`Name for new ${kind} prompt`);
    if (!customName?.trim()) return;
    setBusy(true);
    try {
      const result = (await staffFetch("/api/images/prompts", {
        method: "POST",
        body: JSON.stringify({
          kind,
          name: customName.trim(),
          content,
          is_default: false,
        }),
      })) as { prompt: ImagePrompt };
      setSelectedId(result.prompt.id);
      success("Prompt created");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}"?`)) return;
    setBusy(true);
    try {
      await staffFetch(`/api/images/prompts/${selected.id}`, { method: "DELETE" });
      success("Prompt deleted");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault() {
    if (!selected) return;
    setBusy(true);
    try {
      await staffFetch(`/api/images/prompts/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_default: true }),
      });
      success("Default updated");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold capitalize text-zinc-900">{kind} prompt</h2>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void create()}>
            New
          </Button>
          <Button type="button" variant="secondary" disabled={busy || prompts.length <= 1} onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </div>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {prompts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.is_default ? " (default)" : ""}
          </option>
        ))}
      </select>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <textarea
        className="min-h-56 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || selected?.is_default}
          onClick={() => void makeDefault()}
        >
          Set as default
        </Button>
      </div>
    </div>
  );
}

export function ImageStylesPage() {
  const { data } = useStaffSWR<PromptsResponse>("/api/images/prompts");
  const { data: exercisesData } = useStaffSWR<ListResponse>("/api/images/exercises");
  const sample = exercisesData?.exercises?.[0];

  const preview = useMemo(() => {
    const system = data?.system.find((p) => p.is_default) ?? data?.system[0];
    const exercise = data?.exercise.find((p) => p.is_default) ?? data?.exercise[0];
    if (!system || !exercise || !sample) return "";
    return assembleImagePrompt({
      systemContent: system.content,
      exerciseContent: exercise.content,
      name: sample.display_name,
      description: sample.description ?? "",
      exo_id: sample.exo_id,
    });
  }, [data, sample]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Styles</h1>
        <p className="text-sm text-zinc-500">
          System and exercise prompt templates used when generating catalog images.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PromptEditorPanel kind="system" prompts={data?.system ?? []} />
        <PromptEditorPanel kind="exercise" prompts={data?.exercise ?? []} />
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">
          Live preview{sample ? ` · ${sample.display_name}` : ""}
        </h2>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
          {preview || "Loading preview…"}
        </pre>
      </div>
    </div>
  );
}
