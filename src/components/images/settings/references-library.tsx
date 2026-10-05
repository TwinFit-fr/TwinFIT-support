"use client";

import { useEffect, useMemo, useState } from "react";
import { mutate } from "swr";
import type { TaxonomyData } from "@/components/catalog/taxonomy/types";
import { Button, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import type { ImageStyle, ReferenceLink, StyleReference } from "@/lib/images/types";
import { AssetCard, AssetNote } from "./asset-card";
import { readAsBase64, selectClass } from "./form-ui";
import {
  type PickerExercise,
  type PickerOptions,
  ReferenceTargetPicker,
  TargetChip,
} from "./reference-target-picker";

type ReferencesResponse = { references: StyleReference[] };
type ReferenceResponse = { reference: StyleReference };

type Draft = {
  name: string;
  instruction: string;
  prompt: string;
  links: ReferenceLink[];
  file: File | null;
};

const VISIBLE_CHIPS = 4;

function emptyDraft(): Draft {
  return { name: "", instruction: "", prompt: "", links: [], file: null };
}

function draftOf(reference: StyleReference): Draft {
  return {
    name: reference.name,
    instruction: reference.instruction,
    prompt: reference.prompt ?? "",
    links: reference.links,
    file: null,
  };
}

/** Create or edit a reference: what it is, how to use it, and what it is used for. */
function ReferenceDialog({
  initial,
  editing,
  options,
  busy,
  onCancel,
  onSave,
}: {
  initial: Draft;
  editing: boolean;
  options: PickerOptions;
  busy: boolean;
  onCancel: () => void;
  onSave: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const label = "block text-xs font-medium text-zinc-600";
  const hint = "mt-1 block text-[11px] font-normal text-zinc-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-dialog-title"
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border border-zinc-200 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 id="reference-dialog-title" className="text-lg font-semibold">
            {editing ? "Edit reference" : "New reference"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            An extra input image for the exercises, muscles or groups you link it to.
          </p>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className={label}>
            Name
            <input
              className={selectClass}
              autoFocus
              placeholder="Olympic barbell"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className={label}>
            How the model should use it
            <textarea
              className={`${selectClass} min-h-20`}
              placeholder="Draw exactly this barbell: same plates, colors and proportions."
              value={draft.instruction}
              onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
            />
            <span className={hint}>Added to the prompt every time this image is sent.</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              {editing ? "Replace image" : "Image"}
              <input
                type="file"
                accept="image/png,image/webp,image/jpeg"
                className="mt-1 block w-full text-xs"
                onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] ?? null })}
              />
              <span className={hint}>Or leave empty and use Generate on the card.</span>
            </label>
            <label className={label}>
              Prompt for Generate (optional)
              <textarea
                className={`${selectClass} min-h-20 font-mono text-xs`}
                placeholder="A single olympic barbell, flat illustration, {background_color} background"
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              />
            </label>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-zinc-600">Used for</p>
            <p className="text-[11px] text-zinc-500">
              Sent when generating these targets: an exercise’s Start frame, or a muscle or
              group map. A group link does not include its muscles or exercises.
            </p>
            <ReferenceTargetPicker
              value={draft.links}
              onChange={(links) => setDraft({ ...draft, links })}
              options={options}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !draft.name.trim()}
            onClick={() => onSave(draft)}
          >
            {busy ? "Saving…" : editing ? "Save reference" : "Create reference"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReferenceCard({
  reference,
  busy,
  onUpload,
  onGenerate,
  onEdit,
  onDelete,
}: {
  reference: StyleReference;
  busy: boolean;
  onUpload: (file: File) => void;
  onGenerate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hidden = reference.links.length - VISIBLE_CHIPS;
  return (
    <AssetCard
      fileId={reference.file_id}
      title={reference.name}
      busy={busy}
      onUpload={onUpload}
      onGenerate={reference.prompt ? onGenerate : undefined}
      extraActions={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            className="h-8 px-2.5 text-xs"
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            className="h-8 px-2.5 text-xs"
            onClick={onDelete}
          >
            Delete
          </Button>
        </>
      }
    >
      <AssetNote title={reference.instruction}>
        {reference.instruction || (
          <span className="italic text-zinc-400">
            No instruction: the model only sees the image.
          </span>
        )}
      </AssetNote>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {reference.links.length === 0 ? (
          <span className="text-[11px] italic text-zinc-400">Not linked</span>
        ) : (
          <>
            {reference.links.slice(0, VISIBLE_CHIPS).map((link) => (
              <TargetChip key={`${link.kind}:${link.id}`} link={link} />
            ))}
            {hidden > 0 && <span className="text-[11px] text-zinc-500">+{hidden} more</span>}
          </>
        )}
      </div>
    </AssetCard>
  );
}

/** Free reference images of a style, each sent only for the targets it is linked to. */
export function ReferencesLibrary({ style }: { style: ImageStyle }) {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const listKey = `/api/images/styles/${style.id}/references`;
  const { data, isLoading } = useStaffSWR<ReferencesResponse>(listKey);
  const [dialog, setDialog] = useState<{ reference: StyleReference | null } | null>(null);
  const { data: exercisesData } = useStaffSWR<{ exercises: PickerExercise[] }>(
    dialog ? `/api/images/exercises?style=${style.id}` : null,
  );
  const { data: taxonomy } = useStaffSWR<{ data: TaxonomyData }>(
    dialog ? "/api/catalog/taxonomy" : null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const references = data?.references ?? [];

  const options = useMemo<PickerOptions>(
    () => ({
      exercises: exercisesData?.exercises ?? [],
      groups: (taxonomy?.data?.catalog_muscle_groups ?? []).filter((g) => g.active !== false),
      muscles: (taxonomy?.data?.catalog_muscles ?? []).filter((m) => m.active !== false),
    }),
    [exercisesData, taxonomy],
  );

  async function uploadImage(referenceId: string, file: File) {
    return (await staffFetch(`${listKey}/${referenceId}/image`, {
      method: "POST",
      body: JSON.stringify({
        action: "upload",
        mimeType: file.type,
        data: await readAsBase64(file),
      }),
    })) as ReferenceResponse;
  }

  async function save(draft: Draft) {
    const editing = dialog?.reference ?? null;
    const body = JSON.stringify({
      name: draft.name,
      instruction: draft.instruction,
      prompt: draft.prompt || null,
      links: draft.links.map(({ kind, id }) => ({ kind, id })),
    });
    setSaving(true);
    try {
      const { reference } = (await staffFetch(
        editing ? `${listKey}/${editing.id}` : listKey,
        { method: editing ? "PATCH" : "POST", body },
      )) as ReferenceResponse;
      if (draft.file) await uploadImage(reference.id, draft.file);
      await mutate(listKey);
      setDialog(null);
      success(editing ? "Reference saved" : "Reference created");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not save reference");
    } finally {
      setSaving(false);
    }
  }

  async function imageAction(reference: StyleReference, action: "generate" | File) {
    if (action === "generate" && !window.confirm(`Generate "${reference.name}" with OpenAI?`)) {
      return;
    }
    setBusyId(reference.id);
    try {
      if (action === "generate") {
        await staffFetch(`${listKey}/${reference.id}/image`, {
          method: "POST",
          body: JSON.stringify({ action: "generate" }),
        });
      } else {
        await uploadImage(reference.id, action);
      }
      await mutate(listKey);
      success("Reference image updated");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Image update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(reference: StyleReference) {
    if (!window.confirm(`Delete "${reference.name}" and its links? This cannot be undone.`)) {
      return;
    }
    setBusyId(reference.id);
    try {
      await staffFetch(`${listKey}/${reference.id}`, { method: "DELETE" });
      await mutate(listKey);
      success("Reference deleted");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not delete reference");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          type="button"
          className="h-8 px-3 text-xs"
          onClick={() => setDialog({ reference: null })}
        >
          New reference
        </Button>
      </div>
      {isLoading && !data ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : references.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-xs text-zinc-500">
          No references yet. Add one for a specific bar, machine, pose or detail, and link it to
          the exercises, muscles or groups that need it.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {references.map((reference) => (
            <ReferenceCard
              key={reference.id}
              reference={reference}
              busy={busyId === reference.id}
              onUpload={(file) => void imageAction(reference, file)}
              onGenerate={() => void imageAction(reference, "generate")}
              onEdit={() => setDialog({ reference })}
              onDelete={() => void remove(reference)}
            />
          ))}
        </div>
      )}
      {dialog && (
        <ReferenceDialog
          initial={dialog.reference ? draftOf(dialog.reference) : emptyDraft()}
          editing={Boolean(dialog.reference)}
          options={options}
          busy={saving}
          onCancel={() => setDialog(null)}
          onSave={(draft) => void save(draft)}
        />
      )}
    </div>
  );
}
