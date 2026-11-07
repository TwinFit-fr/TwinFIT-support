"use client";

import { useMemo, useState } from "react";
import { Check, Move3d, RotateCcw, Save, X } from "lucide-react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { useToast } from "@/components/ui/toast";
import { equipmentKey } from "@/lib/studio/equipment";
import { useStudioStore, type EditMode, type EditTool } from "@/lib/studio/store";
import type { BaseAvatar } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { Chip, IconButton, M3Button, Segmented, Select } from "./ui";

const MODES: { value: EditMode; label: string; title: string }[] = [
  { value: "off", label: "Off", title: "Leave the rig editor" },
  { value: "sockets", label: "Sockets", title: "Move the avatar's attachment points (hands, back, feet)" },
  { value: "model", label: "Model", title: "Move a generated model relative to its socket" },
];
const TOOLS: { value: EditTool; label: string; title: string }[] = [
  { value: "translate", label: "Move", title: "Translate (metres)" },
  { value: "rotate", label: "Rotate", title: "Rotate (degrees)" },
];

const fmt = (v: number | undefined, digits: number) => (v ?? 0).toFixed(digits);

/**
 * Floating panel over the viewport: pick what the gizmo moves (a socket of the avatar, or the
 * model in use of an item in the scene), move or rotate it, read the numbers, save or discard.
 * Sockets save on the avatar; a model's placement saves on its equipment_models row.
 */
export function RigEditor({ avatar, onSaved }: { avatar: BaseAvatar | null; onSaved: () => void }) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const edit = useStudioStore((s) => s.edit);
  const setEdit = useStudioStore((s) => s.setEdit);
  const draftSockets = useStudioStore((s) => s.draftSockets);
  const draftPlacements = useStudioStore((s) => s.draftPlacements);
  const clearDrafts = useStudioStore((s) => s.clearDrafts);
  const previewItems = useStudioStore((s) => s.previewItems);
  const models = useStudioStore((s) => s.equipmentModels);
  const [saving, setSaving] = useState(false);

  const sockets = draftSockets ?? avatar?.sockets ?? [];
  // Items in the scene whose code has a model in use: the only ones the model mode can place.
  const modelTargets = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of previewItems) {
      const key = equipmentKey(item.kind, item.code);
      if (models[key] && !seen.has(key)) seen.set(key, `${item.code} (${item.kind})`);
    }
    return [...seen.entries()];
  }, [previewItems, models]);

  const dirty = draftSockets !== null || Object.keys(draftPlacements).length > 0;

  const changeMode = (mode: EditMode) => {
    const target =
      mode === "sockets" ? (sockets.find((s) => s.id === edit.target)?.id ?? sockets[0]?.id ?? null)
      : mode === "model" ? (modelTargets.find(([key]) => key === edit.target)?.[0] ?? modelTargets[0]?.[0] ?? null)
      : null;
    setEdit({ mode, target });
  };

  const discard = () => {
    clearDrafts();
    toast.info("Changes discarded");
  };

  const save = async () => {
    setSaving(true);
    try {
      if (draftSockets && avatar) {
        await staffFetch(`/api/studio/avatars/${avatar.id}`, { method: "PATCH", body: JSON.stringify({ sockets: draftSockets }) });
      }
      for (const [key, placement] of Object.entries(draftPlacements)) {
        const model = models[key];
        if (!model) continue;
        await staffFetch(`/api/studio/equipment/${model.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "placement", size_m: placement.size_m, offset: placement.offset, rotation: placement.rotation }),
        });
      }
      clearDrafts();
      onSaved();
      toast.success("Rig saved", draftSockets ? `${avatar?.name}: sockets updated` : "Model placement updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the rig");
    } finally {
      setSaving(false);
    }
  };

  const targetSocket = edit.mode === "sockets" ? sockets.find((s) => s.id === edit.target) : undefined;
  const targetPlacement = edit.mode === "model" && edit.target ? (draftPlacements[edit.target] ?? models[edit.target]?.placement) : undefined;
  const offset = targetSocket?.offset ?? targetPlacement?.offset;
  const rotation = targetSocket?.rotation ?? targetPlacement?.rotation;

  if (edit.mode === "off") {
    return (
      <div className="pointer-events-none absolute right-4 top-12 z-10">
        <M3Button
          size="sm"
          variant="tonal"
          className="pointer-events-auto studio-glass"
          onClick={() => changeMode("sockets")}
          disabled={!avatar}
          title="Edit the sockets of the avatar and the placement of equipment models"
        >
          <Move3d className="h-3.5 w-3.5" /> Rig editor
        </M3Button>
      </div>
    );
  }

  return (
    <div className="studio-glass studio-scroll absolute right-4 top-12 z-10 max-h-[calc(100%-8rem)] w-[300px] overflow-y-auto rounded-2xl p-3 text-xs shadow-xl">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-semibold tracking-tight">
          <Move3d className="h-3.5 w-3.5 text-(--m3-primary)" /> Rig editor
        </span>
        <IconButton label="Close the rig editor" onClick={() => changeMode("off")} className="h-7 w-7" disabled={saving}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-(--m3-on-surface-variant)">
        The avatar holds its bind pose while you edit. Drag the gizmo in the viewport; values are metres and degrees in the socket&apos;s frame. A model&apos;s grip is defined on the right hand and mirrored to the left, and is kept for every exercise that uses it.
      </p>
      <div className="mt-3 space-y-2">
        <Segmented value={edit.mode} onChange={changeMode} size="sm" options={MODES} className="w-full justify-between" />
        {edit.mode === "sockets" ? (
          <Select value={edit.target ?? ""} onChange={(e) => setEdit({ target: e.target.value || null })} aria-label="Socket" className="h-8 py-0 text-xs">
            {sockets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} · {s.bone}
              </option>
            ))}
          </Select>
        ) : (
          <Select value={edit.target ?? ""} onChange={(e) => setEdit({ target: e.target.value || null })} aria-label="Model" className="h-8 py-0 text-xs">
            {!modelTargets.length ? <option value="">No generated model in this scene</option> : null}
            {modelTargets.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        )}
        <div className="flex items-center gap-2">
          <Segmented value={edit.tool} onChange={(tool) => setEdit({ tool })} size="sm" options={TOOLS} className="flex-1 justify-between" />
          <Chip selected={edit.snap} onClick={() => setEdit({ snap: !edit.snap })} title="Snap rotations to 45° and moves to 5 mm">
            Snap 45°
          </Chip>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-(--m3-surface-container) p-2 font-mono text-[11px] text-(--m3-on-surface-variant)">
          <div>
            <div className="text-[10px] uppercase tracking-wider">offset m</div>
            <div className={cn(targetSocket || targetPlacement ? "text-(--m3-on-surface)" : "")}>
              {fmt(offset?.[0], 3)} {fmt(offset?.[1], 3)} {fmt(offset?.[2], 3)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider">rotation °</div>
            <div className={cn(targetSocket || targetPlacement ? "text-(--m3-on-surface)" : "")}>
              {rotation?.length === 4 ? "quaternion" : `${fmt(rotation?.[0], 1)} ${fmt(rotation?.[1], 1)} ${fmt(rotation?.[2], 1)}`}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 pt-1">
          <M3Button size="sm" variant="text" onClick={discard} disabled={!dirty || saving}>
            <RotateCcw className="h-3.5 w-3.5" /> Discard
          </M3Button>
          <M3Button size="sm" variant="filled" onClick={save} disabled={!dirty} busy={saving}>
            {dirty ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} Save
          </M3Button>
        </div>
      </div>
    </div>
  );
}
