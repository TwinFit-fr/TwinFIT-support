"use client";

import { useMemo, useState } from "react";
import { Check, Move3d, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { equipmentKey } from "@/lib/studio/equipment";
import { useStudioStore, type EditMode, type EditTool } from "@/lib/studio/store";
import type { BaseAvatar, Vec3 } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { Chip, IconButton, M3Button, NumberField, Segmented, Select, TextInput } from "./ui";

const MODES: { value: EditMode; label: string; title: string }[] = [
  { value: "off", label: "Off", title: "Leave the rig editor" },
  { value: "sockets", label: "Sockets", title: "Move the avatar's attachment points (hands, back, feet)" },
  { value: "model", label: "Model", title: "Move a generated model relative to its socket" },
];
const TOOLS: { value: EditTool; label: string; title: string }[] = [
  { value: "translate", label: "Move", title: "Translate (metres)" },
  { value: "rotate", label: "Rotate", title: "Rotate (degrees)" },
];
const AXES = ["x", "y", "z"] as const;

/** Numeric entry of a vector: three fields, one per axis. */
function VectorFields({ label, value, step, digits, onChange, disabled }: { label: string; value: Vec3; step: number; digits: number; onChange: (next: Vec3) => void; disabled?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-(--m3-on-surface-variant)">{label}</div>
      <div className="mt-1 grid grid-cols-3 gap-1">
        {AXES.map((axis, i) => (
          <NumberField
            key={axis}
            aria-label={`${label} ${axis}`}
            value={value[i]}
            step={step}
            digits={digits}
            disabled={disabled}
            onCommit={(v) => {
              const next = [...value] as Vec3;
              next[i] = v;
              onChange(next);
            }}
            className="h-7 px-1.5 py-0 text-[11px]"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Floating panel over the viewport: pick what the gizmo moves (a socket of the avatar, or the
 * model in use of an item in the scene), move or rotate it with the gizmo or by typing, add or
 * remove sockets, save or discard. Sockets save on the avatar; a model's placement saves on its
 * equipment_models row. Drafts are bound to the avatar they came from.
 */
export function RigEditor({ avatar, onSaved }: { avatar: BaseAvatar | null; onSaved: () => void }) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const confirm = useConfirm();
  const edit = useStudioStore((s) => s.edit);
  const setEdit = useStudioStore((s) => s.setEdit);
  const draftSockets = useStudioStore((s) => (avatar && s.draftSockets?.avatarId === avatar.id ? s.draftSockets.sockets : null));
  const draftPlacements = useStudioStore((s) => s.draftPlacements);
  const clearDrafts = useStudioStore((s) => s.clearDrafts);
  const updateDraftSocket = useStudioStore((s) => s.updateDraftSocket);
  const addDraftSocket = useStudioStore((s) => s.addDraftSocket);
  const removeDraftSocket = useStudioStore((s) => s.removeDraftSocket);
  const setDraftPlacement = useStudioStore((s) => s.setDraftPlacement);
  const previewItems = useStudioStore((s) => s.previewItems);
  const models = useStudioStore((s) => s.equipmentModels);
  const modelBones = useStudioStore((s) => s.modelBones);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const [newBone, setNewBone] = useState("");

  const saved = useMemo(() => avatar?.sockets ?? [], [avatar]);
  const sockets = draftSockets ?? saved;
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

  const changeMode = async (mode: EditMode) => {
    if (mode === "off" && dirty) {
      const ok = await confirm({ title: "Discard the rig changes?", description: "Sockets or placements you moved are not saved.", confirmLabel: "Discard", variant: "danger" });
      if (!ok) return;
      clearDrafts();
    }
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
    if (!avatar) return;
    setSaving(true);
    try {
      if (draftSockets) {
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
      toast.success("Rig saved", draftSockets ? `${avatar.name}: sockets updated` : "Model placement updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the rig");
    } finally {
      setSaving(false);
    }
  };

  const addSocket = () => {
    if (!avatar) return;
    const id = newId.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!id || !newBone) return;
    if (sockets.some((s) => s.id === id)) {
      toast.error(`A socket ${id} exists already`);
      return;
    }
    addDraftSocket(avatar.id, saved, { id, bone: newBone, offset: [0, 0, 0], rotation: [0, 0, 0] });
    setAdding(false);
    setNewId("");
  };

  const targetSocket = edit.mode === "sockets" ? sockets.find((s) => s.id === edit.target) : undefined;
  const targetPlacement = edit.mode === "model" && edit.target ? (draftPlacements[edit.target] ?? models[edit.target]?.placement) : undefined;
  const offset: Vec3 = (targetSocket?.offset ?? targetPlacement?.offset ?? [0, 0, 0]) as Vec3;
  const rawRotation = targetSocket?.rotation ?? targetPlacement?.rotation;
  const rotationIsQuaternion = rawRotation?.length === 4;
  const rotation: Vec3 = rotationIsQuaternion || !rawRotation ? [0, 0, 0] : (rawRotation as Vec3);
  const hasTarget = Boolean(targetSocket || targetPlacement);

  const setOffset = (next: Vec3) => {
    if (!avatar) return;
    if (targetSocket) updateDraftSocket(avatar.id, saved, targetSocket.id, { offset: next });
    else if (targetPlacement && edit.target) setDraftPlacement(edit.target, { ...targetPlacement, offset: next });
  };
  const setRotation = (next: Vec3) => {
    if (!avatar) return;
    if (targetSocket) updateDraftSocket(avatar.id, saved, targetSocket.id, { rotation: next });
    else if (targetPlacement && edit.target) setDraftPlacement(edit.target, { ...targetPlacement, rotation: next });
  };

  if (edit.mode === "off") {
    return (
      <div className="pointer-events-none absolute right-4 top-12 z-10">
        <M3Button
          size="sm"
          variant="tonal"
          className="pointer-events-auto studio-glass"
          onClick={() => void changeMode("sockets")}
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
          {dirty ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-(--m3-warning)" title="Unsaved changes" /> : null}
        </span>
        <IconButton label="Close the rig editor" onClick={() => void changeMode("off")} className="h-7 w-7" disabled={saving}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-(--m3-on-surface-variant)">
        The avatar holds its bind pose while you edit. Drag the gizmo in the viewport or type the numbers; metres and degrees in the socket&apos;s frame. A model&apos;s grip is defined on the right hand and mirrored to the left, and is kept for every exercise that uses it.
      </p>
      <div className="mt-3 space-y-2">
        <Segmented value={edit.mode} onChange={(mode) => void changeMode(mode)} size="sm" options={MODES} className="w-full justify-between" />
        {edit.mode === "sockets" ? (
          <div className="flex items-center gap-1">
            <Select value={edit.target ?? ""} onChange={(e) => setEdit({ target: e.target.value || null })} aria-label="Socket" className="h-8 flex-1 py-0 text-xs">
              {!sockets.length ? <option value="">No socket yet</option> : null}
              {sockets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.bone}
                </option>
              ))}
            </Select>
            <IconButton label="Add a socket" onClick={() => setAdding((v) => !v)} className="h-8 w-8" disabled={!modelBones.length}>
              <Plus className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              label="Remove this socket"
              onClick={() => avatar && targetSocket && removeDraftSocket(avatar.id, saved, targetSocket.id)}
              className="h-8 w-8"
              disabled={!targetSocket}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
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
        {edit.mode === "sockets" && adding ? (
          <div className="space-y-1.5 rounded-xl border border-(--m3-outline-variant) p-2">
            <TextInput value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="socket id (head, hip_l…)" aria-label="New socket id" className="h-7 px-2 py-0 text-[11px]" />
            <Select value={newBone} onChange={(e) => setNewBone(e.target.value)} aria-label="Bone of the new socket" className="h-7 py-0 text-[11px]">
              <option value="">bone…</option>
              {modelBones.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
            <div className="flex justify-end gap-1">
              <M3Button size="sm" variant="text" onClick={() => setAdding(false)}>
                Cancel
              </M3Button>
              <M3Button size="sm" variant="tonal" onClick={addSocket} disabled={!newId.trim() || !newBone}>
                Add
              </M3Button>
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Segmented value={edit.tool} onChange={(tool) => setEdit({ tool })} size="sm" options={TOOLS} className="flex-1 justify-between" />
          <Chip selected={edit.snap} onClick={() => setEdit({ snap: !edit.snap })} title="Snap rotations to 45° and moves to 5 mm">
            Snap 45°
          </Chip>
        </div>
        <div className={cn("space-y-2 rounded-xl bg-(--m3-surface-container) p-2 font-mono text-[11px]", !hasTarget && "opacity-50")}>
          <VectorFields label="offset m" value={offset} step={0.005} digits={3} onChange={setOffset} disabled={!hasTarget} />
          {rotationIsQuaternion ? (
            <div className="text-[10px] text-(--m3-on-surface-variant)">rotation: quaternion (move it with the gizmo to convert)</div>
          ) : (
            <VectorFields label="rotation °" value={rotation} step={5} digits={1} onChange={setRotation} disabled={!hasTarget} />
          )}
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

