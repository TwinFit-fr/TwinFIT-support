"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { mutate } from "swr";
import { Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { PROMPT_PLACEHOLDERS, assembleImagePrompt, selectedPrompts } from "@/lib/images/prompt";
import type { ImagePrompt, ImageSettings, ImageStyle, Subject } from "@/lib/images/types";
import { FRAME_POSITIONS, SUBJECTS } from "@/lib/images/types";
import { cn } from "@/lib/utils";

type PromptsResponse = {
  system: ImagePrompt[];
  position: ImagePrompt[];
  support: ImagePrompt[];
};

type ListResponse = {
  exercises: {
    exo_id: number;
    display_name: string;
    description: string | null;
    prompt_details: string;
  }[];
};

function PromptEditorPanel({
  title,
  kind,
  position = null,
  prompts,
  inUseId,
}: {
  title: string;
  kind: "system" | "position" | "support";
  position?: number | null;
  prompts: ImagePrompt[];
  inUseId: string | null | undefined;
}) {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const [selectedId, setSelectedId] = useState<string>("");
  const selected =
    prompts.find((p) => p.id === selectedId) ??
    prompts.find((p) => p.id === inUseId) ??
    prompts[0] ??
    null;
  // Edits belong to the prompt they were made on; switching or reloading it shows its text again.
  const [draft, setDraft] = useState<{
    prompt: ImagePrompt | null;
    name: string;
    content: string;
  } | null>(null);
  const editing = draft && draft.prompt === selected ? draft : null;
  const name = editing?.name ?? selected?.name ?? "";
  const content = editing?.content ?? selected?.content ?? "";
  const setName = (next: string) => setDraft({ prompt: selected, name: next, content });
  const setContent = (next: string) => setDraft({ prompt: selected, name, content: next });
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true);
    try {
      await action();
      success(message);
      await mutate("/api/images/prompts");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!selected) return;
    void run(async () => {
      await staffFetch(`/api/images/prompts/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, content }),
      });
    }, "Prompt saved");
  }

  function create() {
    const customName = window.prompt(`Name for new ${title} prompt`);
    if (!customName?.trim()) return;
    void run(async () => {
      const result = (await staffFetch("/api/images/prompts", {
        method: "POST",
        body: JSON.stringify({ kind, position, name: customName.trim(), content }),
      })) as { prompt: ImagePrompt };
      setSelectedId(result.prompt.id);
    }, "Prompt created");
  }

  function remove() {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}"?`)) return;
    void run(async () => {
      await staffFetch(`/api/images/prompts/${selected.id}`, { method: "DELETE" });
      setSelectedId("");
      await mutate("/api/images/styles");
    }, "Prompt deleted");
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={create}>
            New
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || prompts.length <= 1}
            onClick={remove}
          >
            Delete
          </Button>
        </div>
      </div>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        value={selected?.id ?? ""}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {prompts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.id === inUseId ? " (in use)" : ""}
          </option>
        ))}
      </select>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <textarea
        className="min-h-56 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <Button type="button" disabled={busy || !selected} onClick={save}>
        Save
      </Button>
    </div>
  );
}

export function ImagePromptsPage() {
  const { data } = useStaffSWR<PromptsResponse>("/api/images/prompts");
  const { data: settings } = useStaffSWR<ImageSettings>("/api/images/settings");
  const { data: stylesData } = useStaffSWR<{ styles: ImageStyle[] }>("/api/images/styles");
  const [previewPosition, setPreviewPosition] = useState(0);
  const [previewSubject, setPreviewSubject] = useState<Subject>("man");

  const defaultStyle = useMemo(() => {
    const styles = stylesData?.styles ?? [];
    return (
      styles.find((s) => s.id === settings?.default_style_id) ?? styles[0] ?? null
    );
  }, [stylesData, settings?.default_style_id]);

  const { data: exercisesData } = useStaffSWR<ListResponse>(
    defaultStyle ? `/api/images/exercises?style=${defaultStyle.id}` : null,
  );
  const sample = exercisesData?.exercises?.[0];

  const preview = useMemo(() => {
    const chosen = selectedPrompts(
      defaultStyle,
      data ? [...data.system, ...data.position] : [],
      previewPosition,
    );
    if (!chosen.system || !chosen.position || !sample) return "";
    return assembleImagePrompt({
      systemContent: chosen.system.content,
      positionContent: chosen.position.content,
      name: sample.display_name,
      description: sample.description ?? "",
      exo_id: sample.exo_id,
      subject: previewSubject,
      background_color: defaultStyle?.params.background_color,
      details: sample.prompt_details,
    });
  }, [data, defaultStyle, sample, previewPosition, previewSubject]);

  const pill = (active: boolean) =>
    cn(
      "rounded-full px-2.5 py-1 text-xs font-medium",
      active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
    );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Prompts</h1>
        <p className="text-sm text-zinc-500">
          Edit prompt texts here; choose which ones are used in{" "}
          <Link href="/images/settings" className="underline">
            Settings
          </Link>
          . Placeholders: {PROMPT_PLACEHOLDERS.join(", ")}.
        </p>
      </div>
      <PromptEditorPanel
        title="System prompt (style)"
        kind="system"
        prompts={data?.system ?? []}
        inUseId={defaultStyle?.system_prompt_id}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {FRAME_POSITIONS.map((frame, i) => (
          <PromptEditorPanel
            key={frame.id}
            title={`Position ${frame.id} · ${frame.label}`}
            kind="position"
            position={frame.id}
            prompts={(data?.position ?? []).filter((p) => p.position === frame.id)}
            inUseId={
              defaultStyle
                ? [defaultStyle.start_prompt_id, defaultStyle.mid_prompt_id, defaultStyle.end_prompt_id][
                    i
                  ]
                : null
            }
          />
        ))}
      </div>
      <PromptEditorPanel
        title="Support prompt"
        kind="support"
        prompts={data?.support ?? []}
        inUseId={defaultStyle?.support_prompt_id}
      />
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">
            Live preview (default style prompts)
            {sample ? ` · ${sample.display_name}` : ""}
            {defaultStyle ? ` · ${defaultStyle.code}` : ""}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {SUBJECTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPreviewSubject(s)}
                className={pill(previewSubject === s)}
              >
                {s}
              </button>
            ))}
            <span className="mx-1 w-px bg-zinc-200" />
            {FRAME_POSITIONS.map((frame) => (
              <button
                key={frame.id}
                type="button"
                onClick={() => setPreviewPosition(frame.id)}
                className={pill(previewPosition === frame.id)}
              >
                {frame.label}
              </button>
            ))}
          </div>
        </div>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
          {preview || "Loading preview…"}
        </pre>
      </div>
    </div>
  );
}
