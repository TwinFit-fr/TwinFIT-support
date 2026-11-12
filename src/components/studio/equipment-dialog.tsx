"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Coins, ImagePlus, Loader2, Sparkles, Trash2, Upload, Wand2, X } from "lucide-react";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { EQUIPMENT_KEY, placementOf, type EquipmentResponse } from "@/lib/studio/equipment";
import { MESHY_EQUIPMENT, equipmentBuildRequest } from "@/lib/studio/paid-actions";
import { readAsDataUrl, relativeTime } from "@/lib/studio/format";
import { MAX_IMAGE_BYTES } from "@/lib/studio/schemas";
import { studioAssetUrl } from "@/lib/studio/storage-url";
import type { EquipmentKind, EquipmentModel, StudioEquipment } from "@/lib/studio/types";
import { VECTOR_STATUS_LABEL } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { AuthImage } from "./auth-image";
import { usePaidConfirm } from "./studio-confirm";
import { Chip, IconButton, M3Button, NumberField, Segmented, StatusDot, TextInput } from "./ui";


type Filter = "all" | EquipmentKind;

/** The model a card talks about: the one in use, else the newest. */
function primaryModel(entry: StudioEquipment): EquipmentModel | null {
  return entry.models.find((m) => m.active) ?? entry.models[0] ?? null;
}

/** The preview of a generated model: its thumbnail in the bucket (staff JWT). */
function modelThumb(model: EquipmentModel | null): string | null {
  return model ? studioAssetUrl(model.thumbnail_file_id, model.thumbnail_url) : null;
}

function ModelRow({
  model,
  busy,
  onAction,
}: {
  model: EquipmentModel;
  busy: boolean;
  onAction: (model: EquipmentModel, action: "activate" | "deactivate" | "delete") => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg bg-(--m3-surface-container-high) px-2 py-1.5 text-[11px]">
      <StatusDot status={model.status} />
      <span className="h-7 w-7 shrink-0 overflow-hidden rounded-md bg-(--m3-surface-container-highest)">
        <AuthImage src={modelThumb(model)} alt="" />
      </span>
      <span className="min-w-0 flex-1 truncate text-(--m3-on-surface-variant)">
        {VECTOR_STATUS_LABEL[model.status]} · {model.provider} · {relativeTime(model.inserted_at)}
        {model.error ? ` · ${model.error}` : ""}
      </span>
      {model.active ? (
        <Chip tone="success" className="h-5 px-1.5 text-[10px]">
          in use
        </Chip>
      ) : null}
      {model.status === "ready" ? (
        <IconButton
          label={model.active ? "Stop using" : "Use this model"}
          active={model.active}
          disabled={busy}
          onClick={() => onAction(model, model.active ? "deactivate" : "activate")}
          className="h-6 w-6"
        >
          <CheckCircle2 className="h-3 w-3" />
        </IconButton>
      ) : null}
      {!model.active ? (
        <IconButton label="Delete" disabled={busy} onClick={() => onAction(model, "delete")} className="h-6 w-6">
          <Trash2 className="h-3 w-3" />
        </IconButton>
      ) : null}
    </li>
  );
}

function EquipmentCard({
  entry,
  busy,
  canGenerate,
  onGenerate,
  onUpload,
  onAction,
  onSize,
}: {
  entry: StudioEquipment;
  busy: boolean;
  canGenerate: boolean;
  onGenerate: (entry: StudioEquipment, image?: File) => void;
  onUpload: (entry: StudioEquipment, file: File) => void;
  onAction: (model: EquipmentModel, action: "activate" | "deactivate" | "delete") => void;
  onSize: (model: EquipmentModel, sizeM: number) => void;
}) {
  const model = primaryModel(entry);
  const [history, setHistory] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const placement = model ? placementOf(model.kind, model.params) : null;
  const processing = model?.status === "processing" || model?.status === "pending";

  return (
    <li className="flex flex-col gap-2.5 rounded-2xl border border-(--m3-outline-variant) bg-(--m3-surface-container-low) p-3">
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-(--m3-surface-container-highest)" title="Reference image (default style)">
          <AuthImage src={entry.reference_image_url} alt={`${entry.name} reference`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold tracking-tight">{entry.name}</h3>
            <Chip tone={entry.kind === "load" ? "primary" : "neutral"} className="h-5 px-1.5 text-[10px]">
              {entry.kind}
            </Chip>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-(--m3-on-surface-variant)">{entry.code}</div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-(--m3-on-surface-variant)">
            {model ? (
              <>
                <StatusDot status={model.status} />
                <span>{VECTOR_STATUS_LABEL[model.status]}</span>
                {model.active ? (
                  <Chip tone="success" className="h-5 px-1.5 text-[10px]">
                    in use
                  </Chip>
                ) : null}
                {processing ? <span className="tabular-nums">{model.progress}%</span> : null}
              </>
            ) : (
              <span>No model yet</span>
            )}
          </div>
          {processing ? (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-(--m3-surface-container-highest)">
              <div className="studio-pulse h-full rounded-full bg-(--m3-primary) transition-[width]" style={{ width: `${Math.max(4, model?.progress ?? 0)}%` }} />
            </div>
          ) : null}
          {model?.status === "error" ? <p className="mt-1 line-clamp-2 text-[11px] text-(--m3-error)">{model.error}</p> : null}
        </div>
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-(--m3-surface-container-highest)" title="Generated model">
          <AuthImage src={modelThumb(model)} alt={model ? `${entry.name} model` : ""} />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <M3Button
          size="sm"
          variant={model?.status === "ready" ? "text" : "tonal"}
          disabled={!canGenerate || !entry.reference_image_url || busy || processing}
          busy={busy && processing}
          onClick={() => onGenerate(entry)}
          title={entry.reference_image_url ? `Image-to-3D from the reference image (about ${MESHY_EQUIPMENT.credits} credits; asks first)` : "No reference image in the default style"}
        >
          <Wand2 className="h-3.5 w-3.5" /> {model ? "Regenerate" : "Generate"}
        </M3Button>
        <IconButton
          label="Generate from another image (one object, plain background)"
          disabled={!canGenerate || busy || processing}
          onClick={() => imageInput.current?.click()}
          className="h-8 w-8"
        >
          <ImagePlus className="h-3.5 w-3.5" />
        </IconButton>
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onGenerate(entry, file);
          }}
        />
        <IconButton label="Upload a .glb for this code" disabled={busy} onClick={() => fileInput.current?.click()} className="h-8 w-8">
          <Upload className="h-3.5 w-3.5" />
        </IconButton>
        <input
          ref={fileInput}
          type="file"
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onUpload(entry, file);
          }}
        />
        {model?.status === "ready" ? (
          <>
            <IconButton
              label={model.active ? "Stop using this model (back to the proxy)" : "Use this model in the viewer"}
              active={model.active}
              disabled={busy}
              onClick={() => onAction(model, model.active ? "deactivate" : "activate")}
              className="h-8 w-8"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </IconButton>
            <label className="ml-auto flex items-center gap-1 text-[10px] text-(--m3-on-surface-variant)" title="Longest dimension the viewer scales the model to">
              size
              <NumberField
                aria-label={`Size of the ${entry.name} model in metres`}
                min={0.01}
                max={10}
                step={0.01}
                digits={2}
                value={placement?.size_m ?? 0}
                onCommit={(value) => {
                  if (value > 0 && placement && value !== placement.size_m) onSize(model, value);
                }}
                className="h-7 w-20 px-2 py-0 text-[11px]"
              />
              m
            </label>
          </>
        ) : null}
        {!model?.active && model && !processing ? (
          <IconButton label="Delete this model" disabled={busy} onClick={() => onAction(model, "delete")} className={cn("h-8 w-8", model.status !== "ready" && "ml-auto")}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
      </div>

      {entry.models.length > 1 ? (
        <div>
          <button type="button" onClick={() => setHistory((v) => !v)} className="flex cursor-pointer items-center gap-1 text-[11px] text-(--m3-primary)">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", history && "rotate-180")} />
            {entry.models.length} models
          </button>
          {history ? (
            <ul className="mt-1.5 space-y-1">
              {entry.models.map((m) => (
                <ModelRow key={m.id} model={m} busy={busy} onAction={onAction} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * The 3D model of every catalog implement and support: generate it with Meshy from the style
 * reference image, upload one, pick the one the viewer draws, scale it. Every Meshy start asks
 * first (cost and time). The workspace polls the list while a task runs, so a build keeps
 * advancing, and shows in the jobs tray, with this dialog closed.
 */
export function EquipmentDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const confirm = useConfirm();
  const paidConfirm = usePaidConfirm();
  const [filter, setFilter] = useState<Filter>("all");
  const [hint, setHint] = useState("");
  const [busyCodes, setBusyCodes] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  // Same key as the workspace, which owns the poll: this dialog only reads and refreshes after an action.
  const { data, mutate, isLoading } = useStaffSWR<EquipmentResponse>(EQUIPMENT_KEY);
  const equipment = useMemo(() => data?.equipment ?? [], [data]);
  const visible = filter === "all" ? equipment : equipment.filter((e) => e.kind === filter);
  const missing = equipment.filter((e) => e.reference_image_url && !e.models.some((m) => m.status === "ready" || m.status === "processing" || m.status === "pending"));
  const configured = data?.configured ?? true;

  const refresh = async () => {
    await mutate();
    onChanged();
  };

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusyCodes((s) => new Set(s).add(key));
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The action failed");
    } finally {
      setBusyCodes((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  };

  const generate = async (entry: StudioEquipment, image?: File) => {
    const current = primaryModel(entry);
    const ok = await paidConfirm(equipmentBuildRequest({ names: [entry.name], customImage: image?.name ?? null, replacesReady: current?.status === "ready" }));
    if (!ok) return;
    await withBusy(`${entry.kind}:${entry.code}`, async () => {
      if (image && image.size > MAX_IMAGE_BYTES) throw new Error("The reference image must be under 20 MB");
      const image_data_url = image ? await readAsDataUrl(image) : null;
      await staffFetch(EQUIPMENT_KEY, {
        method: "POST",
        body: JSON.stringify({ kind: entry.kind, code: entry.code, prompt: hint.trim() || null, image_data_url }),
      });
      toast.success(`${entry.name}: Meshy task started. Follow it in Jobs; it keeps going if you close this dialog.`, "Generating model");
      await refresh();
    });
  };

  const generateMissing = async () => {
    const ok = await paidConfirm(equipmentBuildRequest({ names: missing.map((e) => e.name) }));
    if (!ok) return;
    setBulkRunning(true);
    try {
      for (const entry of missing) {
        try {
          await staffFetch(EQUIPMENT_KEY, {
            method: "POST",
            body: JSON.stringify({ kind: entry.kind, code: entry.code, prompt: hint.trim() || null }),
          });
        } catch (err) {
          toast.error(`${entry.name}: ${err instanceof Error ? err.message : "failed"}`);
        }
        await mutate();
      }
      onChanged();
    } finally {
      setBulkRunning(false);
    }
  };

  const upload = (entry: StudioEquipment, file: File) =>
    withBusy(`${entry.kind}:${entry.code}`, async () => {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", entry.kind);
      form.set("code", entry.code);
      await staffFetch(EQUIPMENT_KEY, { method: "POST", body: form });
      toast.success(`${entry.name}: model uploaded`);
      await refresh();
    });

  const action = (model: EquipmentModel, kind: "activate" | "deactivate" | "delete") =>
    withBusy(`${model.kind}:${model.code}`, async () => {
      if (kind === "delete") {
        const ok = await confirm({
          title: `Delete this ${model.name} model?`,
          description: "The row and its files in 3d-workspace are removed.",
          confirmLabel: "Delete",
          variant: "danger",
        });
        if (!ok) return;
        await staffFetch(`${EQUIPMENT_KEY}/${model.id}`, { method: "DELETE" });
        toast.success(`${model.name}: model deleted`);
      } else {
        await staffFetch(`${EQUIPMENT_KEY}/${model.id}`, { method: "PATCH", body: JSON.stringify({ action: kind }) });
        toast.success(kind === "activate" ? `${model.name}: the viewer now draws this model` : `${model.name}: back to the proxy`);
      }
      await refresh();
    });

  const setSize = (model: EquipmentModel, sizeM: number) =>
    withBusy(`${model.kind}:${model.code}`, async () => {
      const placement = placementOf(model.kind, model.params);
      await staffFetch(`${EQUIPMENT_KEY}/${model.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "placement", size_m: sizeM, offset: placement.offset, rotation: placement.rotation }),
      });
      await refresh();
    });

  const credits = data?.credits ?? null;

  return (
    <Modal
      onClose={onClose}
      labelledBy="equipment-dialog-title"
      dismissible={!bulkRunning}
      className="studio-root w-[860px] max-w-[calc(100vw-2rem)] rounded-3xl border border-(--m3-outline-variant) bg-(--m3-surface-container) p-0 text-(--m3-on-surface) shadow-2xl backdrop:bg-(--m3-scrim)"
    >
      <div className="flex items-center justify-between gap-4 border-b border-(--m3-outline-variant) px-5 py-4">
        <div>
          <h2 id="equipment-dialog-title" className="text-base font-semibold tracking-tight">
            Equipment models
          </h2>
          <p className="mt-0.5 text-[11px] text-(--m3-on-surface-variant)">
            Image-to-3D with Meshy from the reference image of the default style. The viewer draws the model in use; the rest fall back to proxies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {credits ? (
            <Chip tone="primary" title={`${credits.monthly_credits} monthly + ${credits.permanent_credits} permanent`}>
              <Coins className="h-3.5 w-3.5" /> {credits.balance} credits
            </Chip>
          ) : !configured ? (
            <Chip tone="warning">MESHY_API_KEY missing</Chip>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={bulkRunning}
            aria-label="Close"
            className="studio-state flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-(--m3-on-surface-variant)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-(--m3-outline-variant) px-5 py-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: "all", label: `All ${equipment.length}` },
            { value: "load", label: `Load ${equipment.filter((e) => e.kind === "load").length}` },
            { value: "support", label: `Support ${equipment.filter((e) => e.kind === "support").length}` },
          ]}
        />
        <TextInput
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="Texture hint for the next generations (optional; the catalog description is used otherwise)"
          className="h-8 min-w-[280px] flex-1 py-0 text-xs"
        />
        <M3Button size="sm" variant="filled" disabled={!configured || !missing.length || bulkRunning} busy={bulkRunning} onClick={generateMissing}>
          <Sparkles className="h-3.5 w-3.5" /> Generate missing ({missing.length})
        </M3Button>
      </div>

      <div className="studio-scroll max-h-[66vh] overflow-y-auto px-5 py-4">
        {isLoading && !equipment.length ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-(--m3-on-surface-variant)">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the equipment…
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {visible.map((entry) => (
              <EquipmentCard
                key={`${entry.kind}:${entry.code}`}
                entry={entry}
                busy={busyCodes.has(`${entry.kind}:${entry.code}`)}
                canGenerate={configured}
                onGenerate={generate}
                onUpload={upload}
                onAction={action}
                onSize={setSize}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
