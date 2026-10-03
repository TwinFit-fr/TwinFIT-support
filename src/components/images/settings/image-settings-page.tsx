"use client";

import { useEffect, useMemo, useState } from "react";
import { mutate } from "swr";
import { Button, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  MAX_CONCURRENCY_LIMIT,
  validateGenerationParams,
  validateMaxConcurrency,
} from "@/lib/images/capabilities";
import type {
  GenerationParams,
  ImagePrompt,
  ImageSettings,
  ImageStyle,
  Subject,
} from "@/lib/images/types";
import { CharactersSection } from "./characters-section";
import { Section, readAsBase64, selectClass } from "./form-ui";
import { ModelSection } from "./model-section";
import { PromptsSection } from "./prompts-section";
import { StyleBar } from "./style-bar";
import { SupportsSection } from "./supports-section";

type ModelsResponse = { models: { id: string }[] };
type StylesResponse = { styles: ImageStyle[] };
type StyleResponse = { style: ImageStyle };
type PromptsResponse = {
  system: ImagePrompt[];
  position: ImagePrompt[];
  support: ImagePrompt[];
};

type StyleDraft = {
  name: string;
  published: boolean;
  params: GenerationParams;
  system_prompt_id: string | null;
  start_prompt_id: string | null;
  mid_prompt_id: string | null;
  end_prompt_id: string | null;
  support_prompt_id: string | null;
  logo_in_exercises: boolean;
};

type WorkspaceDraft = {
  default_style_id: string;
  max_concurrency: number;
};

function toStyleDraft(style: ImageStyle): StyleDraft {
  return {
    name: style.name,
    published: style.published,
    params: { ...style.params },
    system_prompt_id: style.system_prompt_id,
    start_prompt_id: style.start_prompt_id,
    mid_prompt_id: style.mid_prompt_id,
    end_prompt_id: style.end_prompt_id,
    support_prompt_id: style.support_prompt_id,
    logo_in_exercises: style.logo_in_exercises,
  };
}

function toWorkspaceDraft(settings: ImageSettings): WorkspaceDraft {
  return {
    default_style_id: settings.default_style_id,
    max_concurrency: settings.max_concurrency,
  };
}

const MAX_LOGO_BYTES = 3 * 1024 * 1024;

export function ImageSettingsPage() {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();

  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useStaffSWR<ImageSettings>("/api/images/settings");
  const { data: stylesData, isLoading: stylesLoading } =
    useStaffSWR<StylesResponse>("/api/images/styles");
  const { data: modelsData } = useStaffSWR<ModelsResponse>("/api/images/models");
  const { data: promptsData } = useStaffSWR<PromptsResponse>("/api/images/prompts");

  const styles = stylesData?.styles ?? [];
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedStyleId) return;
    if (settings?.default_style_id) {
      setSelectedStyleId(settings.default_style_id);
      return;
    }
    if (styles[0]?.id) setSelectedStyleId(styles[0].id);
  }, [selectedStyleId, settings?.default_style_id, styles]);

  const styleKey = selectedStyleId ? `/api/images/styles/${selectedStyleId}` : null;
  const {
    data: styleData,
    isLoading: styleLoading,
    error: styleError,
  } = useStaffSWR<StyleResponse>(styleKey);

  const style = styleData?.style ?? null;

  const [styleEdits, setStyleEdits] = useState<StyleDraft | null>(null);
  const [workspaceEdits, setWorkspaceEdits] = useState<WorkspaceDraft | null>(null);
  const [savingStyle, setSavingStyle] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [characterBusy, setCharacterBusy] = useState<Subject | null>(null);
  const [supportBusy, setSupportBusy] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  // Reset local style edits when switching styles or after remote refresh of a clean form.
  useEffect(() => {
    setStyleEdits(null);
  }, [selectedStyleId]);

  const styleDraft = useMemo(
    () => styleEdits ?? (style ? toStyleDraft(style) : null),
    [styleEdits, style],
  );
  const workspaceDraft = useMemo(
    () => workspaceEdits ?? (settings ? toWorkspaceDraft(settings) : null),
    [workspaceEdits, settings],
  );

  const models = useMemo(() => {
    const ids = (modelsData?.models ?? []).map((m) => m.id);
    if (styleDraft && !ids.includes(styleDraft.params.model)) {
      ids.unshift(styleDraft.params.model);
    }
    return ids;
  }, [modelsData, styleDraft]);

  const loading = settingsLoading || stylesLoading || (Boolean(selectedStyleId) && styleLoading);
  const error = settingsError ?? styleError;

  if (loading || !settings || !styleDraft || !workspaceDraft || !style) {
    return error ? (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error.message}
      </div>
    ) : (
      <Skeleton className="h-[60vh] w-full rounded-xl" />
    );
  }

  const issues = validateGenerationParams(styleDraft.params);
  const concurrencyIssue = validateMaxConcurrency(workspaceDraft.max_concurrency);
  const styleDirty = JSON.stringify(styleDraft) !== JSON.stringify(toStyleDraft(style));
  const workspaceDirty =
    JSON.stringify(workspaceDraft) !== JSON.stringify(toWorkspaceDraft(settings));

  async function refreshStyle(updated: ImageStyle) {
    await mutate(`/api/images/styles/${updated.id}`, { style: updated }, { revalidate: false });
    await mutate(
      "/api/images/styles",
      (current: StylesResponse | undefined) =>
        current
          ? {
              styles: current.styles.map((s) => (s.id === updated.id ? updated : s)),
            }
          : current,
      { revalidate: false },
    );
  }

  async function saveStyle() {
    if (!styleDraft || !selectedStyleId) return;
    setSavingStyle(true);
    try {
      const result = (await staffFetch(`/api/images/styles/${selectedStyleId}`, {
        method: "PUT",
        body: JSON.stringify(styleDraft),
      })) as StyleResponse;
      await refreshStyle(result.style);
      setStyleEdits(toStyleDraft(result.style));
      success("Style saved");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingStyle(false);
    }
  }

  async function saveWorkspace() {
    if (!workspaceDraft) return;
    setSavingWorkspace(true);
    try {
      const saved = (await staffFetch("/api/images/settings", {
        method: "PUT",
        body: JSON.stringify(workspaceDraft),
      })) as ImageSettings;
      await mutate("/api/images/settings", saved, { revalidate: false });
      setWorkspaceEdits(toWorkspaceDraft(saved));
      success("Workspace settings saved");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function createStyle() {
    const code = window.prompt("Style code (SCREAMING_SNAKE, e.g. TWINFIT)");
    if (!code?.trim()) return;
    const name = window.prompt("Display name", code.trim()) ?? "";
    if (!name.trim()) return;
    const copy =
      selectedStyleId &&
      window.confirm("Copy params, prompts and flags from the current style?");
    try {
      const result = (await staffFetch("/api/images/styles", {
        method: "POST",
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          copyFromStyleId: copy ? selectedStyleId : null,
        }),
      })) as StyleResponse;
      await mutate("/api/images/styles");
      setSelectedStyleId(result.style.id);
      success("Style created");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not create style");
    }
  }

  async function deleteStyle() {
    if (!selectedStyleId || !style || !settings) return;
    const defaultId = settings.default_style_id;
    if (defaultId === selectedStyleId) {
      toastError("Cannot delete the default style");
      return;
    }
    if (!window.confirm(`Delete style "${style.code}"? This cannot be undone.`)) return;
    try {
      await staffFetch(`/api/images/styles/${selectedStyleId}`, { method: "DELETE" });
      await mutate("/api/images/styles");
      setSelectedStyleId(defaultId);
      success("Style deleted");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not delete style");
    }
  }

  async function characterAction(subject: Subject, action: "generate" | "remove" | File) {
    if (!selectedStyleId) return;
    if (action === "generate" && !styleDirty) {
      if (!window.confirm(`Generate a new ${subject} reference with OpenAI?`)) return;
    }
    if (action === "remove" && !window.confirm(`Remove the ${subject} reference?`)) return;
    setCharacterBusy(subject);
    try {
      let result: StyleResponse;
      if (action === "remove") {
        result = (await staffFetch(
          `/api/images/styles/${selectedStyleId}/characters/${subject}`,
          { method: "DELETE" },
        )) as StyleResponse;
      } else if (action === "generate") {
        result = (await staffFetch(
          `/api/images/styles/${selectedStyleId}/characters/${subject}`,
          { method: "POST", body: JSON.stringify({ action: "generate" }) },
        )) as StyleResponse;
      } else {
        result = (await staffFetch(
          `/api/images/styles/${selectedStyleId}/characters/${subject}`,
          {
            method: "POST",
            body: JSON.stringify({
              action: "upload",
              mimeType: action.type,
              data: await readAsBase64(action),
            }),
          },
        )) as StyleResponse;
      }
      await refreshStyle(result.style);
      success(action === "remove" ? "Reference removed" : "Reference updated");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Reference update failed");
    } finally {
      setCharacterBusy(null);
    }
  }

  async function supportAction(supportId: string, action: "generate" | "remove" | File) {
    if (!selectedStyleId) return;
    setSupportBusy(supportId);
    try {
      let result: StyleResponse;
      if (action === "remove") {
        result = (await staffFetch(
          `/api/images/styles/${selectedStyleId}/supports/${supportId}`,
          { method: "DELETE" },
        )) as StyleResponse;
      } else if (action === "generate") {
        result = (await staffFetch(
          `/api/images/styles/${selectedStyleId}/supports/${supportId}`,
          { method: "POST", body: JSON.stringify({ action: "generate" }) },
        )) as StyleResponse;
      } else {
        result = (await staffFetch(
          `/api/images/styles/${selectedStyleId}/supports/${supportId}`,
          {
            method: "POST",
            body: JSON.stringify({
              action: "upload",
              mimeType: action.type,
              data: await readAsBase64(action),
            }),
          },
        )) as StyleResponse;
      }
      await refreshStyle(result.style);
      success(action === "remove" ? "Support reference removed" : "Support reference updated");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Support update failed");
    } finally {
      setSupportBusy(null);
    }
  }

  async function uploadLogo(file: File) {
    if (!selectedStyleId) return;
    if (file.size > MAX_LOGO_BYTES) {
      toastError("Logo must be under 3 MB");
      return;
    }
    setLogoBusy(true);
    try {
      const result = (await staffFetch(`/api/images/styles/${selectedStyleId}/logo`, {
        method: "POST",
        body: JSON.stringify({ mimeType: file.type, data: await readAsBase64(file) }),
      })) as StyleResponse;
      await refreshStyle(result.style);
      success("Logo updated");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    if (!selectedStyleId) return;
    if (!window.confirm("Remove the brand logo from this style?")) return;
    setLogoBusy(true);
    try {
      const result = (await staffFetch(`/api/images/styles/${selectedStyleId}/logo`, {
        method: "DELETE",
      })) as StyleResponse;
      await refreshStyle(result.style);
      success("Logo removed");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Logo removal failed");
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
          <p className="text-sm text-zinc-500">
            Image styles and workspace defaults. Shared by all staff.
            {style.updated_at ? ` Style last saved ${new Date(style.updated_at).toLocaleString()}.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!styleDirty || savingStyle}
            onClick={() => setStyleEdits(toStyleDraft(style))}
          >
            Discard
          </Button>
          <Button
            type="button"
            disabled={!styleDirty || savingStyle || issues.length > 0}
            onClick={() => void saveStyle()}
          >
            {savingStyle ? "Saving…" : "Save style"}
          </Button>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <Section
        title="Workspace"
        description="Default style for new batches and OpenAI concurrency for all staff."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-xs font-medium text-zinc-600">
            Default style
            <select
              className={selectClass}
              value={workspaceDraft.default_style_id}
              onChange={(e) =>
                setWorkspaceEdits({ ...workspaceDraft, default_style_id: e.target.value })
              }
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            Concurrent OpenAI requests: {workspaceDraft.max_concurrency}
            <input
              type="range"
              min={1}
              max={MAX_CONCURRENCY_LIMIT}
              value={workspaceDraft.max_concurrency}
              onChange={(e) =>
                setWorkspaceEdits({
                  ...workspaceDraft,
                  max_concurrency: Number(e.target.value),
                })
              }
              className="mt-1 w-full"
            />
            <span className="mt-1 block text-[11px] font-normal text-zinc-500">
              With 3, the three positions of an exercise run at the same time.
            </span>
          </label>
        </div>
        {concurrencyIssue && (
          <p className="text-xs text-amber-800">{concurrencyIssue}</p>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!workspaceDirty || savingWorkspace}
            onClick={() => setWorkspaceEdits(toWorkspaceDraft(settings))}
          >
            Discard workspace
          </Button>
          <Button
            type="button"
            disabled={!workspaceDirty || savingWorkspace || Boolean(concurrencyIssue)}
            onClick={() => void saveWorkspace()}
          >
            {savingWorkspace ? "Saving…" : "Save workspace"}
          </Button>
        </div>
      </Section>

      <StyleBar
        styles={styles}
        styleId={selectedStyleId!}
        published={styleDraft.published}
        isDefault={settings.default_style_id === selectedStyleId}
        busy={savingStyle}
        onSelect={(id) => {
          if (styleDirty && !window.confirm("Discard unsaved style changes?")) return;
          setSelectedStyleId(id);
        }}
        onPublishedChange={(published) => setStyleEdits({ ...styleDraft, published })}
        onNew={() => void createStyle()}
        onDelete={() => void deleteStyle()}
      />

      <label className="block max-w-md text-xs font-medium text-zinc-600">
        Style name
        <input
          className={selectClass}
          value={styleDraft.name}
          onChange={(e) => setStyleEdits({ ...styleDraft, name: e.target.value })}
        />
        <span className="mt-1 block text-[11px] font-normal text-zinc-500">
          Code: {style.code}
        </span>
      </label>

      <ModelSection
        params={styleDraft.params}
        models={models}
        onChange={(params) => setStyleEdits({ ...styleDraft, params })}
      />

      <PromptsSection
        draft={styleDraft}
        prompts={promptsData}
        onChange={(patch) => setStyleEdits({ ...styleDraft, ...patch })}
      />

      <CharactersSection
        style={style}
        params={styleDraft.params}
        logoInExercises={styleDraft.logo_in_exercises}
        dirty={styleDirty}
        characterBusy={characterBusy}
        logoBusy={logoBusy}
        onLogoInExercisesChange={(logo_in_exercises) =>
          setStyleEdits({ ...styleDraft, logo_in_exercises })
        }
        onInputFidelityChange={(input_fidelity) =>
          setStyleEdits({
            ...styleDraft,
            params: { ...styleDraft.params, input_fidelity },
          })
        }
        onCharacterAction={(subject, action) => void characterAction(subject, action)}
        onLogoUpload={(file) => void uploadLogo(file)}
        onLogoRemove={() => void removeLogo()}
      />

      <SupportsSection
        style={style}
        dirty={styleDirty}
        busyId={supportBusy}
        onAction={(supportId, action) => void supportAction(supportId, action)}
      />
    </div>
  );
}
