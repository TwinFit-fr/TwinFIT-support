"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import {
  MAP_VIEWS,
  MAP_VIEW_LABEL,
  type MapBase,
  type MapMask,
  type MapMuscle,
  type MapView,
} from "@/lib/muscle-map/types";
import { MaskAdjustDialog } from "./mask-adjust-dialog";
import { MaskedBase, UploadButton, errorText, formatDate } from "./shared";
import { BATCH_CONCURRENCY, type MuscleMapApi } from "./use-muscle-map";

const selectClass = "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm";

/** Masks per view: one card per paintable muscle on the view's active base. */
export function MasksPanel({ api }: { api: MuscleMapApi }) {
  const board = api.data!;
  const toast = useToast();
  const [view, setView] = useState<MapView>("front");
  const [batchRunning, setBatchRunning] = useState(false);
  const [adjusting, setAdjusting] = useState<{ mask: MapMask; muscle: MapMuscle } | null>(null);

  const base = board.bases.find((b) => b.view === view && b.active) ?? null;
  const muscles = useMemo(
    () =>
      board.muscles
        .filter((m) => m.view === view)
        .sort((a, b) => a.muscle.name.localeCompare(b.muscle.name)),
    [board.muscles, view],
  );
  const activeMask = (muscleId: string) =>
    base ? board.masks.find((m) => m.base_id === base.id && m.muscle_id === muscleId && m.active) : undefined;
  // Failed ones stay missing, so the batch retries them.
  const missing = muscles.filter((m) => {
    const run = api.runs[m.muscle_id];
    return !activeMask(m.muscle_id) && (!run || run.status === "error");
  });

  function countDone(v: MapView) {
    const vBase = board.bases.find((b) => b.view === v && b.active);
    const vMuscles = board.muscles.filter((m) => m.view === v);
    const done = vBase
      ? vMuscles.filter((m) =>
          board.masks.some((k) => k.base_id === vBase.id && k.muscle_id === m.muscle_id && k.active),
        ).length
      : 0;
    return `${done}/${vMuscles.length}`;
  }

  // Masks made before volume shading: re-extract them from their source to add it.
  const flat = board.masks.filter(
    (m) => m.active && m.source_file_id && m.params.adjust?.volume === undefined,
  );
  const [reshading, setReshading] = useState(false);

  async function reshade() {
    setReshading(true);
    try {
      const failed = await api.reshadeMasks(flat);
      if (failed) toast.error(`${failed} of ${flat.length} mask(s) failed`);
      else toast.success(`Volume added to ${flat.length} mask(s)`);
    } finally {
      setReshading(false);
    }
  }

  async function generateMissing() {
    setBatchRunning(true);
    try {
      const failed = await api.generateMasks(missing.map((m) => m.muscle_id));
      if (failed) toast.error(`${failed} of ${missing.length} mask(s) failed; see the cards`);
      else toast.success(`${missing.length} mask(s) generated`);
    } finally {
      setBatchRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {MAP_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                v === view ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white hover:bg-zinc-50"
              }`}
            >
              {MAP_VIEW_LABEL[v]} <span className="opacity-60">{countDone(v)}</span>
            </button>
          ))}
        </div>
        <Button
          type="button"
          className="h-8 px-2 text-xs"
          disabled={!base || missing.length === 0 || batchRunning}
          onClick={() => void generateMissing()}
          title={`Runs ${BATCH_CONCURRENCY} at a time from this page; keep it open`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {batchRunning ? "Generating…" : `Generate missing (${missing.length})`}
        </Button>
        {flat.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-2 text-xs"
            disabled={reshading || batchRunning}
            onClick={() => void reshade()}
            title="Re-extracts from the stored sources with the default volume; no generation"
          >
            {reshading ? "Adding volume…" : `Add volume to older masks (${flat.length})`}
          </Button>
        )}
        <AddMuscle api={api} />
      </div>

      {!base ? (
        <Card className="text-sm text-zinc-500">
          No active {view} base. Make one in the Bases tab first.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {muscles.map((muscle) => (
            <MuscleCard
              key={muscle.muscle_id}
              api={api}
              base={base}
              muscle={muscle}
              masks={board.masks.filter(
                (m) => m.base_id === base.id && m.muscle_id === muscle.muscle_id,
              )}
              hasAnyMask={board.masks.some((m) => m.muscle_id === muscle.muscle_id)}
              color={board.settings.target_color}
              onAdjust={(mask) => setAdjusting({ mask, muscle })}
            />
          ))}
          {muscles.length === 0 && (
            <p className="text-sm text-zinc-500">No muscle is drawn on this view.</p>
          )}
        </div>
      )}

      {adjusting && base && (
        <MaskAdjustDialog
          api={api}
          mask={adjusting.mask}
          base={base}
          muscleName={adjusting.muscle.muscle.name}
          keyColor={board.settings.key_color}
          paintColor={board.settings.target_color}
          onClose={() => setAdjusting(null)}
        />
      )}
    </div>
  );
}

function MuscleCard({
  api,
  base,
  muscle,
  masks,
  hasAnyMask,
  color,
  onAdjust,
}: {
  api: MuscleMapApi;
  base: MapBase;
  muscle: MapMuscle;
  /** This muscle's masks on the active base, newest first. */
  masks: MapMask[];
  hasAnyMask: boolean;
  color: string;
  onAdjust: (mask: MapMask) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const run = api.runs[muscle.muscle_id];
  const active = masks.find((m) => m.active);
  const working = busy || run?.status === "running" || run?.status === "queued";

  async function act(task: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      toast.error(errorText(error, failure));
    } finally {
      setBusy(false);
    }
  }

  async function make(upload?: Parameters<MuscleMapApi["createMask"]>[1]) {
    const error = await api.createMask(muscle.muscle_id, upload);
    if (error) toast.error(`${muscle.muscle.name}: ${error}`);
  }

  async function removeMask(mask: MapMask) {
    const ok = await confirm({
      title: "Delete this mask?",
      description: "Its file and its source image are deleted too.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) await act(() => api.deleteMask(mask.id), "Deleting the mask failed");
  }

  return (
    <Card className="space-y-2 p-3">
      <div className="relative">
        <MaskedBase base={base} layers={active ? [{ mask: active, color }] : []} width={320} />
        {working && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/60 text-xs font-medium text-zinc-700">
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            {run?.status === "queued" ? "Queued" : "Working…"}
          </div>
        )}
      </div>
      <div>
        <div className="text-sm font-medium">{muscle.muscle.name}</div>
        <div className="font-mono text-[11px] text-zinc-500">{muscle.muscle.code}</div>
        <div className="text-[11px] text-zinc-500">
          {active ? `${active.method} · ${formatDate(active.created_at)}` : "No active mask"}
          {active && !active.rect && <span className="text-amber-700"> · empty</span>}
        </div>
        {run?.status === "error" && <p className="text-[11px] text-red-600">{run.error}</p>}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          className="h-7 px-2 text-xs"
          disabled={working}
          onClick={() => void make()}
        >
          {active ? "Regenerate" : "Generate"}
        </Button>
        <UploadButton disabled={working} onUpload={(upload) => make(upload)} />
        {active?.source_file_id && (
          <Button
            type="button"
            variant="secondary"
            className="h-7 px-2 text-xs"
            disabled={working}
            onClick={() => onAdjust(active)}
          >
            Adjust
          </Button>
        )}
        {masks.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setShowHistory(!showHistory)}
          >
            History ({masks.length})
          </Button>
        )}
      </div>

      {showHistory && (
        <ul className="space-y-1 border-t border-zinc-100 pt-2">
          {masks.map((mask) => (
            <li key={mask.id} className="flex items-center gap-2">
              <div className="w-10 shrink-0">
                <MaskedBase base={base} layers={[{ mask, color }]} width={96} />
              </div>
              <div className="min-w-0 flex-1 text-[11px] text-zinc-600">
                {mask.active ? "Active · " : ""}
                {mask.method} · {formatDate(mask.created_at)}
              </div>
              {mask.active ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                  disabled={working}
                  onClick={() => void act(() => api.setMaskActive(mask.id, false), "Update failed")}
                >
                  Deactivate
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-6 px-1.5 text-[11px]"
                    disabled={working}
                    onClick={() => void act(() => api.setMaskActive(mask.id, true), "Update failed")}
                  >
                    Activate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-6 px-1.5 text-[11px] text-red-600"
                    disabled={working}
                    onClick={() => void removeMask(mask)}
                  >
                    Delete
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
        <label className="flex items-center gap-1">
          View
          <select
            className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-[11px]"
            value={muscle.view}
            disabled={hasAnyMask || working}
            title={hasAnyMask ? "A muscle with masks can't change view" : undefined}
            onChange={(e) =>
              void act(
                () => api.setMuscleView(muscle.muscle_id, e.target.value as MapView),
                "Changing the view failed",
              )
            }
          >
            {MAP_VIEWS.map((v) => (
              <option key={v} value={v}>
                {MAP_VIEW_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
        {!hasAnyMask && (
          <button
            type="button"
            className="ml-auto text-red-600 hover:underline disabled:opacity-40"
            disabled={working}
            onClick={() =>
              void act(() => api.removeMuscle(muscle.muscle_id), "Removing the muscle failed")
            }
          >
            Stop painting
          </button>
        )}
      </div>
    </Card>
  );
}

/** Makes a catalog muscle paintable on a view. */
function AddMuscle({ api }: { api: MuscleMapApi }) {
  const board = api.data!;
  const toast = useToast();
  const [muscleId, setMuscleId] = useState("");
  const [view, setView] = useState<MapView>("front");
  const [busy, setBusy] = useState(false);
  const mapped = new Set(board.muscles.map((m) => m.muscle_id));
  const options = board.catalog_muscles.filter((m) => !mapped.has(m.id) && m.active !== false);
  if (options.length === 0) return null;

  return (
    <div className="ml-auto flex flex-wrap items-center gap-1">
      <select className={selectClass} value={muscleId} onChange={(e) => setMuscleId(e.target.value)}>
        <option value="">Not painted: {options.length}…</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.code})
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={view}
        onChange={(e) => setView(e.target.value as MapView)}
      >
        {MAP_VIEWS.map((v) => (
          <option key={v} value={v}>
            {MAP_VIEW_LABEL[v]}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="secondary"
        className="h-8 px-2 text-xs"
        disabled={!muscleId || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.addMuscle(muscleId, view);
            setMuscleId("");
          } catch (error) {
            toast.error(errorText(error, "Adding the muscle failed"));
          } finally {
            setBusy(false);
          }
        }}
      >
        Paint on {MAP_VIEW_LABEL[view]}
      </Button>
    </div>
  );
}
