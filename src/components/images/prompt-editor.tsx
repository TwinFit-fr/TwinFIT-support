"use client";

import { useMemo, useState } from "react";
import { mutate } from "swr";
import type { TaxonomyData } from "@/components/catalog/taxonomy/types";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  PROMPT_PLACEHOLDERS,
  assembleImagePrompt,
  fillMuscleMapTemplate,
  bodyRegionTarget,
  muscleGroupTarget,
  muscleTarget,
  selectedPrompts,
} from "@/lib/images/prompt";
import type {
  ImagePrompt,
  ImageStyle,
  MuscleMapTargetKind,
  MuscleMapView,
  StylePrompts,
  Subject,
} from "@/lib/images/types";
import { FRAME_POSITIONS, MUSCLE_MAP_VIEWS, SUBJECTS } from "@/lib/images/types";
import { SegmentedControl } from "@/components/images/generation-controls";
import type { PromptVersion } from "@/lib/images/prompt-versions";
import { cn } from "@/lib/utils";

type StylePromptsResponse = StylePrompts & {
  styleId: string;
  prompts: ImagePrompt[];
};

type ListResponse = {
  exercises: {
    exo_id: number;
    display_name: string;
    description: string | null;
    prompt_details: string;
  }[];
};

type PreviewMode = "exercise" | "muscle_map";

function PromptSlotEditor({
  title,
  prompt,
  styleId,
}: {
  title: string;
  prompt: ImagePrompt | undefined;
  styleId: string;
}) {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const [draft, setDraft] = useState<{ promptId: string; content: string } | null>(null);
  const editing = draft && prompt && draft.promptId === prompt.id ? draft : null;
  const content = editing?.content ?? prompt?.content ?? "";
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const versionsKey = historyOpen && prompt ? `/api/images/prompts/${prompt.id}/versions` : null;
  const { data: versionsData } = useStaffSWR<{ versions: PromptVersion[] }>(versionsKey);
  const versions = versionsData?.versions ?? [];

  function setContent(next: string) {
    if (!prompt) return;
    setDraft({ promptId: prompt.id, content: next });
  }

  async function save() {
    if (!prompt || !editing) return;
    setBusy(true);
    try {
      await staffFetch(`/api/images/prompts/${prompt.id}`, {
        method: "PUT",
        body: JSON.stringify({ content: editing.content }),
      });
      success("Prompt saved");
      await mutate(`/api/images/prompts?styleId=${styleId}`);
      await mutate(`/api/images/prompts/${prompt.id}/versions`);
      setDraft(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const unsaved = editing != null && editing.content !== prompt?.content;

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        {title}
        {unsaved && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            unsaved
          </span>
        )}
      </h2>
      <textarea
        className={cn(
          "min-h-56 w-full rounded-md border px-3 py-2 font-mono text-xs",
          unsaved ? "border-amber-300 bg-amber-50/40" : "border-zinc-300",
        )}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={!prompt}
      />
      <div className="flex gap-2">
        <Button type="button" disabled={busy || !unsaved} onClick={() => void save()}>
          Save
        </Button>
        {unsaved && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
            Discard
          </Button>
        )}
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
          disabled={!prompt}
          className="ml-auto text-xs text-zinc-500 underline hover:text-zinc-800"
        >
          {historyOpen ? "Hide history" : "History"}
        </button>
      </div>
      {historyOpen && (
        <ol className="max-h-72 space-y-1.5 overflow-auto rounded-md border border-zinc-100 bg-zinc-50 p-2">
          {versions.length === 0 && <li className="text-[11px] text-zinc-400">Loading…</li>}
          {versions.map((version, i) => (
            <li key={version.id} className="rounded border border-zinc-200 bg-white p-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-600">
                  {new Date(version.saved_at).toLocaleString()}
                  {i === 0 && <span className="text-zinc-400"> · current</span>}
                </span>
                {version.content !== content && (
                  <button
                    type="button"
                    onClick={() => setContent(version.content)}
                    className="font-medium text-zinc-700 underline hover:text-zinc-950"
                  >
                    Use this text
                  </button>
                )}
              </div>
              <pre className="mt-1 line-clamp-3 whitespace-pre-wrap font-mono text-[10.5px] text-zinc-500">
                {version.content}
              </pre>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** One kind of output (exercise frames, support references, muscle maps) and its slots. */
function SlotGroup({
  title,
  description,
  placeholders,
  children,
}: {
  title: string;
  description: string;
  placeholders: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</p>
        <p className="text-xs text-zinc-500">
          {description} Placeholders: {placeholders.join(", ")}.
        </p>
      </div>
      {children}
    </section>
  );
}

const PREVIEW_MODES = [
  { value: "exercise" as const, label: "Exercise" },
  { value: "muscle_map" as const, label: "Muscle map" },
];

/** The prompt slots of one style (exercise frames, supports, muscle maps) and a live preview. */
export function StylePromptsEditor({ style }: { style: ImageStyle }) {
  const styleId = style.id;
  const [previewMode, setPreviewMode] = useState<PreviewMode>("exercise");
  const [previewPosition, setPreviewPosition] = useState(0);
  const [previewSubject, setPreviewSubject] = useState<Subject>("man");
  const [previewTargetKind, setPreviewTargetKind] = useState<MuscleMapTargetKind>("muscle_group");
  const [previewView, setPreviewView] = useState<MuscleMapView>("front");

  const { data } = useStaffSWR<StylePromptsResponse>(`/api/images/prompts?styleId=${styleId}`);
  const { data: exercisesData } = useStaffSWR<ListResponse>(
    `/api/images/exercises?style=${styleId}`,
  );
  const { data: taxonomy } = useStaffSWR<{ data: TaxonomyData }>(
    previewMode === "muscle_map" ? "/api/catalog/taxonomy" : null,
  );
  const sample = exercisesData?.exercises?.[0];

  const sampleTarget = useMemo(() => {
    const groups = taxonomy?.data?.catalog_muscle_groups ?? [];
    const group = groups.find(
      (g) => g.active !== false && g.group_muscles.some((link) => link.role === "target"),
    );
    if (!group) return null;
    if (previewTargetKind === "body_region") {
      const region = taxonomy?.data?.catalog_body_regions.find((r) => r.id === group.body_region_id);
      return region
        ? bodyRegionTarget({
            ...region,
            muscle_groups: groups.filter((g) => g.body_region_id === region.id),
          })
        : null;
    }
    if (previewTargetKind === "muscle_group") return muscleGroupTarget(group);
    const muscle = group.group_muscles.find((link) => link.role === "target")?.muscle;
    return muscle ? muscleTarget(muscle) : null;
  }, [taxonomy, previewTargetKind]);

  const preview = useMemo(() => {
    if (previewMode === "muscle_map") {
      if (!data?.muscleMap || !sampleTarget) return "";
      return fillMuscleMapTemplate(data.muscleMap.content, {
        view: previewView,
        background_color: style.params.background_color,
        target: sampleTarget,
      });
    }
    const chosen = selectedPrompts(data?.prompts ?? [], previewPosition);
    if (!chosen.system || !chosen.position || !sample) return "";
    return assembleImagePrompt({
      systemContent: chosen.system.content,
      positionContent: chosen.position.content,
      name: sample.display_name,
      description: sample.description ?? "",
      exo_id: sample.exo_id,
      subject: previewSubject,
      background_color: style.params.background_color,
      details: sample.prompt_details,
    });
  }, [
    data,
    style,
    sample,
    sampleTarget,
    previewMode,
    previewPosition,
    previewSubject,
    previewView,
  ]);

  const previewSubjectLabel =
    previewMode === "muscle_map" ? sampleTarget?.name : sample?.display_name;

  return (
    <div className="space-y-6">
      <SlotGroup
        title="Exercise frames"
        description="System prompt plus one prompt per frame position."
        placeholders={PROMPT_PLACEHOLDERS.exercise}
      >
        <PromptSlotEditor title="System prompt" prompt={data?.system} styleId={styleId} />
        <div className="grid gap-4 lg:grid-cols-3">
          {FRAME_POSITIONS.map((frame) => {
            const key = frame.id === 0 ? "start" : frame.id === 1 ? "mid" : "end";
            return (
              <PromptSlotEditor
                key={frame.id}
                title={`Position ${frame.id} · ${frame.label}`}
                prompt={data?.[key]}
                styleId={styleId}
              />
            );
          })}
        </div>
      </SlotGroup>

      <SlotGroup
        title="Support equipment"
        description="Generates the support references of the style."
        placeholders={PROMPT_PLACEHOLDERS.support}
      >
        <PromptSlotEditor title="Support prompt" prompt={data?.support} styleId={styleId} />
      </SlotGroup>

      <SlotGroup
        title="Muscle maps"
        description="The base draws the blank body once per view; each map edits that base to highlight a muscle or a group."
        placeholders={PROMPT_PLACEHOLDERS.muscleMap}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <PromptSlotEditor
            title="Base body (front / back)"
            prompt={data?.muscleBase}
            styleId={styleId}
          />
          <PromptSlotEditor title="Muscle map" prompt={data?.muscleMap} styleId={styleId} />
        </div>
      </SlotGroup>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">
            Live preview
            {previewSubjectLabel ? ` · ${previewSubjectLabel}` : ""}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Preview of"
              value={previewMode}
              onChange={setPreviewMode}
              options={PREVIEW_MODES}
            />
            {previewMode === "exercise" ? (
              <>
                <SegmentedControl
                  label="Preview subject"
                  value={previewSubject}
                  onChange={setPreviewSubject}
                  options={SUBJECTS.map((s) => ({
                    value: s,
                    label: s === "man" ? "Man" : "Woman",
                  }))}
                />
                <SegmentedControl
                  label="Preview position"
                  value={previewPosition}
                  onChange={setPreviewPosition}
                  options={FRAME_POSITIONS.map((f) => ({ value: f.id as number, label: f.label }))}
                />
              </>
            ) : (
              <>
                <SegmentedControl
                  label="Preview target"
                  value={previewTargetKind}
                  onChange={setPreviewTargetKind}
                  options={[
                    { value: "body_region", label: "Region" },
                    { value: "muscle_group", label: "Group" },
                    { value: "muscle", label: "Muscle" },
                  ]}
                />
                <SegmentedControl
                  label="Preview view"
                  value={previewView}
                  onChange={setPreviewView}
                  options={MUSCLE_MAP_VIEWS.map((v) => ({
                    value: v,
                    label: v === "front" ? "Front" : "Back",
                  }))}
                />
              </>
            )}
          </div>
        </div>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
          {preview || "Loading preview…"}
        </pre>
      </div>
    </div>
  );
}
