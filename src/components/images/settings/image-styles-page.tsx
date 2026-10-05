"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { mutate } from "swr";
import { Button, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { validateGenerationParams } from "@/lib/images/capabilities";
import type { GenerationParams, ImageStyle, MuscleMapView, Subject } from "@/lib/images/types";
import { CharactersSection } from "./characters-section";
import { CollapsibleSection, Section, readAsBase64, selectClass } from "./form-ui";
import { ModelSection } from "./model-section";
import { MuscleBasesSection } from "./muscle-bases-section";
import { StyleBar } from "./style-bar";
import { SupportsSection } from "./supports-section";

type ModelsResponse = { models: { id: string }[] };
type StylesResponse = { styles: ImageStyle[] };
type StyleResponse = { style: ImageStyle };

type StyleDraft = {
  name: string;
  published: boolean;
  is_default: boolean;
  params: GenerationParams;
  logo_in_exercises: boolean;
};

type CreateDraft = {
  code: string;
  name: string;
  copyFromCurrent: boolean;
};

function toStyleDraft(style: ImageStyle): StyleDraft {
  return {
    name: style.name,
    published: style.published,
    is_default: style.is_default,
    params: { ...style.params },
    logo_in_exercises: style.logo_in_exercises,
  };
}

const MAX_LOGO_BYTES = 3 * 1024 * 1024;

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function ImageStylesPage() {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();

  const { data: stylesData, isLoading: stylesLoading } =
    useStaffSWR<StylesResponse>("/api/images/styles");
  const { data: modelsData } = useStaffSWR<ModelsResponse>("/api/images/models");

  const styles = useMemo(() => stylesData?.styles ?? [], [stylesData]);
  const fallbackStyleId = styles.find((s) => s.is_default)?.id ?? styles[0]?.id ?? null;
  const [selectedStyleIdOverride, setSelectedStyleIdOverride] = useState<string | null>(null);
  const selectedStyleId = selectedStyleIdOverride ?? fallbackStyleId;
  const defaultStyleId = styles.find((s) => s.is_default)?.id ?? null;

  const styleKey = selectedStyleId ? `/api/images/styles/${selectedStyleId}` : null;
  const {
    data: styleData,
    isLoading: styleLoading,
    error: styleError,
  } = useStaffSWR<StyleResponse>(styleKey);

  const style = styleData?.style ?? null;

  const [styleEdits, setStyleEdits] = useState<{ styleId: string; draft: StyleDraft } | null>(
    null,
  );
  const [savingStyle, setSavingStyle] = useState(false);
  const [characterBusy, setCharacterBusy] = useState<Subject | null>(null);
  const [supportBusy, setSupportBusy] = useState<string | null>(null);
  const [muscleBaseBusy, setMuscleBaseBusy] = useState<MuscleMapView | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>({
    code: "",
    name: "",
    copyFromCurrent: true,
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const styleDraft = useMemo(() => {
    if (!style) return null;
    if (styleEdits?.styleId === style.id) return styleEdits.draft;
    return toStyleDraft(style);
  }, [style, styleEdits]);

  function editStyle(next: StyleDraft) {
    if (!style) return;
    setStyleEdits({ styleId: style.id, draft: next });
  }

  function clearStyleEdits() {
    setStyleEdits(null);
  }

  function selectStyle(id: string) {
    setSelectedStyleIdOverride(id);
    clearStyleEdits();
  }

  const models = useMemo(() => {
    const ids = (modelsData?.models ?? []).map((m) => m.id);
    if (styleDraft && !ids.includes(styleDraft.params.model)) {
      ids.unshift(styleDraft.params.model);
    }
    return ids;
  }, [modelsData, styleDraft]);

  const loading = stylesLoading || (Boolean(selectedStyleId) && styleLoading);
  if (loading || !styleDraft || !style || !selectedStyleId) {
    return styleError ? (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {styleError.message}
      </div>
    ) : (
      <Skeleton className="h-[60vh] w-full rounded-xl" />
    );
  }

  const issues = validateGenerationParams(styleDraft.params);
  const styleDirty = JSON.stringify(styleDraft) !== JSON.stringify(toStyleDraft(style));

  function openCreate() {
    if (styleDirty && !window.confirm("Discard unsaved style changes and create a new style?")) {
      return;
    }
    setCreateDraft({
      code: "",
      name: "",
      copyFromCurrent: Boolean(selectedStyleId),
    });
    setCreateError(null);
    setCreateOpen(true);
  }

  async function refreshStyle(updated: ImageStyle) {
    await mutate(`/api/images/styles/${updated.id}`, { style: updated }, { revalidate: false });
    await mutate(
      "/api/images/styles",
      (current: StylesResponse | undefined) =>
        current
          ? {
              styles: current.styles.map((s) =>
                s.id === updated.id
                  ? updated
                  : updated.is_default
                    ? { ...s, is_default: false }
                    : s,
              ),
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
      clearStyleEdits();
      success("Style saved");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingStyle(false);
    }
  }

  async function submitCreate() {
    const code = normalizeCode(createDraft.code);
    if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
      setCreateError("Code must be SCREAMING_SNAKE (e.g. TWINFIT or RETRO_FLAT).");
      return;
    }
    const name = createDraft.name.trim() || code;
    setCreating(true);
    setCreateError(null);
    try {
      const result = (await staffFetch("/api/images/styles", {
        method: "POST",
        body: JSON.stringify({
          code,
          name,
          copyFromStyleId:
            createDraft.copyFromCurrent && selectedStyleId ? selectedStyleId : null,
        }),
      })) as StyleResponse;
      await mutate("/api/images/styles");
      selectStyle(result.style.id);
      setCreateOpen(false);
      success("Style created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create style";
      setCreateError(message);
      toastError(message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteStyle() {
    if (!selectedStyleId || !style) return;
    if (style.is_default) {
      toastError("Cannot delete the default style");
      return;
    }
    if (!window.confirm(`Delete style "${style.code}"? This cannot be undone.`)) return;
    try {
      await staffFetch(`/api/images/styles/${selectedStyleId}`, { method: "DELETE" });
      await mutate("/api/images/styles");
      if (defaultStyleId) selectStyle(defaultStyleId);
      else {
        setSelectedStyleIdOverride(null);
        clearStyleEdits();
      }
      success("Style deleted");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not delete style");
    }
  }

  /** POST generate / upload or DELETE one style asset; every asset route returns the style. */
  async function assetRequest(
    path: string,
    action: "generate" | "remove" | File,
  ): Promise<StyleResponse> {
    if (action === "remove") {
      return (await staffFetch(path, { method: "DELETE" })) as StyleResponse;
    }
    const body =
      action === "generate"
        ? { action: "generate" }
        : { action: "upload", mimeType: action.type, data: await readAsBase64(action) };
    return (await staffFetch(path, {
      method: "POST",
      body: JSON.stringify(body),
    })) as StyleResponse;
  }

  async function characterAction(subject: Subject, action: "generate" | "remove" | File) {
    if (!selectedStyleId) return;
    if (action === "generate" && !styleDirty) {
      if (!window.confirm(`Generate a new ${subject} reference with OpenAI?`)) return;
    }
    if (action === "remove" && !window.confirm(`Remove the ${subject} reference?`)) return;
    setCharacterBusy(subject);
    try {
      const result = await assetRequest(
        `/api/images/styles/${selectedStyleId}/characters/${subject}`,
        action,
      );
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
      const result = await assetRequest(
        `/api/images/styles/${selectedStyleId}/supports/${supportId}`,
        action,
      );
      await refreshStyle(result.style);
      success(action === "remove" ? "Support reference removed" : "Support reference updated");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Support update failed");
    } finally {
      setSupportBusy(null);
    }
  }

  async function muscleBaseAction(view: MuscleMapView, action: "generate" | "remove" | File) {
    if (!selectedStyleId) return;
    setMuscleBaseBusy(view);
    try {
      const result = await assetRequest(
        `/api/images/styles/${selectedStyleId}/muscle-bases/${view}`,
        action,
      );
      await refreshStyle(result.style);
      success(action === "remove" ? "Muscle map base removed" : "Muscle map base updated");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Muscle map base update failed");
    } finally {
      setMuscleBaseBusy(null);
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
          <h1 className="text-xl font-semibold text-zinc-900">Styles</h1>
          <p className="text-sm text-zinc-500">
            Model, prompts, references and muscle map bases per style.
            {style.updated_at
              ? ` Last saved ${new Date(style.updated_at).toLocaleString()}.`
              : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!styleDirty || savingStyle}
            onClick={() => clearStyleEdits()}
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

      <StyleBar
        styles={styles}
        styleId={selectedStyleId}
        published={styleDraft.published}
        isDefault={styleDraft.is_default}
        busy={savingStyle || creating}
        onSelect={(id) => {
          if (styleDirty && !window.confirm("Discard unsaved style changes?")) return;
          selectStyle(id);
        }}
        onPublishedChange={(published) =>
          editStyle({
            ...styleDraft,
            published,
            is_default: published ? styleDraft.is_default : false,
          })
        }
        onDefaultChange={(is_default) =>
          editStyle({
            ...styleDraft,
            is_default,
            published: is_default || styleDraft.published,
          })
        }
        onNew={openCreate}
        onDelete={() => void deleteStyle()}
      />

      {createOpen && (
        <Section
          title="New style"
          description="Creates a draft style. Prompts are copied from the selected style when enabled."
        >
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-zinc-600">
              Code
              <input
                className={selectClass}
                autoFocus
                placeholder="RETRO_FLAT"
                value={createDraft.code}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, code: e.target.value.toUpperCase() })
                }
              />
              <span className="mt-1 block text-[11px] font-normal text-zinc-500">
                SCREAMING_SNAKE, unique.
              </span>
            </label>
            <label className="block text-xs font-medium text-zinc-600">
              Display name
              <input
                className={selectClass}
                placeholder="Retro flat"
                value={createDraft.name}
                onChange={(e) => setCreateDraft({ ...createDraft, name: e.target.value })}
              />
            </label>
          </div>
          <label className="flex items-start gap-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={createDraft.copyFromCurrent}
              disabled={!selectedStyleId}
              onChange={(e) =>
                setCreateDraft({ ...createDraft, copyFromCurrent: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 rounded border-zinc-300"
            />
            <span>
              Copy params, prompts and flags from{" "}
              <span className="font-medium">{style.code}</span>
              <span className="block text-[11px] text-zinc-500">
                Reference images (characters, supports, muscle bases) are not copied.
              </span>
            </span>
          </label>
          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={creating || !createDraft.code.trim()}
              onClick={() => void submitCreate()}
            >
              {creating ? "Creating…" : "Create style"}
            </Button>
          </div>
        </Section>
      )}

      <label className="block max-w-md text-xs font-medium text-zinc-600">
        Style name
        <input
          className={selectClass}
          value={styleDraft.name}
          onChange={(e) => editStyle({ ...styleDraft, name: e.target.value })}
        />
        <span className="mt-1 block text-[11px] font-normal text-zinc-500">
          Code: {style.code}
        </span>
      </label>

      <Section title="Prompts" description="Prompt texts are owned by each style.">
        <p className="text-sm text-zinc-600">
          Edit exercise, support and muscle map prompts on the{" "}
          <Link href="/images/prompts" className="underline">
            Prompts
          </Link>{" "}
          page (select this style there).
        </p>
      </Section>

      <CollapsibleSection
        title="Model & output"
        description="OpenAI model, size, background, format and quality for this style."
        defaultOpen={false}
      >
        <ModelSection
          params={styleDraft.params}
          models={models}
          onChange={(params) => editStyle({ ...styleDraft, params })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="References"
        description="Character sheets, brand logo, support equipment and muscle map bases. Used automatically by their rules."
        defaultOpen={false}
      >
        <CharactersSection
          style={style}
          params={styleDraft.params}
          logoInExercises={styleDraft.logo_in_exercises}
          dirty={styleDirty}
          characterBusy={characterBusy}
          logoBusy={logoBusy}
          onLogoInExercisesChange={(logo_in_exercises) =>
            editStyle({ ...styleDraft, logo_in_exercises })
          }
          onInputFidelityChange={(input_fidelity) =>
            editStyle({
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
        <MuscleBasesSection
          style={style}
          dirty={styleDirty}
          busyView={muscleBaseBusy}
          onAction={(view, action) => void muscleBaseAction(view, action)}
        />
      </CollapsibleSection>
    </div>
  );
}
