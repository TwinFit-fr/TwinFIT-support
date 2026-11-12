"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Move3d, Plus, Redo2, RotateCcw, Save, Undo2 } from "lucide-react";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { useToast } from "@/components/ui/toast";
import { equipmentKey } from "@/lib/studio/equipment";
import { useLayoutStore } from "@/lib/studio/layout-store";
import { detectedSockets, equipmentLabel, socketLabel, socketOrigin } from "@/lib/studio/rig-points";
import { useStudioStore, type EditMode } from "@/lib/studio/store";
import type { BaseAvatar, Vec3 } from "@/lib/studio/types";
import { LAYOUT_TOKENS } from "@/lib/studio/workspace-layout";
import { RigModeNote } from "./rig-mode-note";
import { AddPointForm, RigPointList, type RigListItem } from "./rig-point-list";
import { RigPointCard } from "./rig-point-card";
import { RigTools } from "./rig-tools";
import { IconButton, M3Button, Segmented } from "./ui";
import { useRigPoints } from "./viewer/rig-stage";

const MODES: { value: Exclude<EditMode, "off">; label: string; title: string }[] = [
  { value: "sockets", label: "Attachment points", title: "Move the avatar's attachment points (hands, back, feet)" },
  { value: "model", label: "Equipment", title: "Move a generated model relative to its attachment point" },
];

/** What an undo or redo did, for screen readers ("Undone: moved left hand."). */
const stepWords = (label: string | null, what: "Undone" | "Redone") =>
  label ? `${what}: ${label.charAt(0).toLowerCase()}${label.slice(1)}.` : `Nothing to ${what === "Undone" ? "undo" : "redo"}.`;

const quatOrEuler = (r: number[] | undefined): { rotation: Vec3; quaternion: boolean } =>
  r?.length === 4 ? { rotation: [0, 0, 0], quaternion: true } : { rotation: (r as Vec3 | undefined) ?? [0, 0, 0], quaternion: false };

/**
 * The stage's way into the rig editor (under the axis widget). The editor itself takes the side
 * pane, so nothing of it covers the body; posing pauses while it is open.
 */
export function RigEditorButton({ avatar }: { avatar: BaseAvatar | null }) {
  const open = () => {
    if (!avatar) return;
    const s = useStudioStore.getState();
    const sockets = s.draftSockets?.avatarId === avatar.id ? s.draftSockets.sockets : avatar.sockets;
    s.setEdit({ mode: "sockets", target: sockets[0]?.id ?? null });
    // The editor lives in the right pane: it shows even if the pane was closed.
    const layout = useLayoutStore.getState();
    if (window.innerWidth < LAYOUT_TOKENS.overlayBelow) layout.setFloating("right");
    else if (layout.right.collapsed) layout.setPane("right", { collapsed: false });
  };
  return (
    <div className="pointer-events-none absolute right-(--studio-stage-inset) top-(--studio-gizmo-reserve) z-10">
      <M3Button
        size="sm"
        variant="tonal"
        className="pointer-events-auto studio-glass"
        onClick={open}
        disabled={!avatar}
        title="Edit the avatar's attachment points and where equipment models sit. Posing pauses while it is open."
      >
        <Move3d className="h-3.5 w-3.5" /> Rig editor
      </M3Button>
    </div>
  );
}

/**
 * The rig editor, in the side pane while it is open. Its points are drawn on the avatar
 * (viewer/rig-points-layer.tsx) and handled like the pose editor's body points; this lists them
 * as a second way to select one and shows the selected one's numbers, which follow a drag as it
 * happens. Undo and redo use the same buttons and keys as the poses. "Back to posing" closes it
 * through the unsaved-work guard. Sockets save on the avatar; a model's placement saves on its
 * equipment_models row.
 */
export function RigEditor({ avatar, onSaved, onBack }: { avatar: BaseAvatar | null; onSaved: () => void; onBack: () => void }) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const edit = useStudioStore((s) => s.edit);
  const setEdit = useStudioStore((s) => s.setEdit);
  const draftSockets = useStudioStore((s) => (avatar && s.draftSockets?.avatarId === avatar.id ? s.draftSockets.sockets : null));
  const draftPlacements = useStudioStore((s) => s.draftPlacements);
  const canUndo = useStudioStore((s) => s.rigHistory.past.length > 0);
  const canRedo = useStudioStore((s) => s.rigHistory.future.length > 0);
  const previewItems = useStudioStore((s) => s.previewItems);
  const models = useStudioStore((s) => s.equipmentModels);
  const modelBones = useStudioStore((s) => s.modelBones);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const st = useStudioStore.getState;

  const saved = useMemo(() => avatar?.sockets ?? [], [avatar]);
  const sockets = draftSockets ?? saved;
  const detected = useMemo(() => (avatar ? detectedSockets(avatar) : null), [avatar]);
  // Items in the scene whose code has a model in use: the only ones the equipment mode can place.
  const modelTargets = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of previewItems) {
      const key = equipmentKey(item.kind, item.code);
      if (models[key] && !seen.has(key)) seen.set(key, item.kind === "support" ? "floor" : (item.socket ?? "scene"));
    }
    return [...seen.entries()];
  }, [previewItems, models]);

  const items: RigListItem[] = useMemo(
    () =>
      edit.mode === "model"
        ? modelTargets.map(([key, on]) => ({ id: key, label: equipmentLabel(key), detail: on, origin: null }))
        : sockets.map((s) => ({ id: s.id, label: socketLabel(s.id), detail: s.id, origin: socketOrigin(s, detected) })),
    [edit.mode, modelTargets, sockets, detected],
  );

  // The stage draws the same points.
  const setPoints = useRigPoints((s) => s.setPoints);
  useEffect(() => {
    setPoints(items.map(({ id, label, origin }) => ({ id, label, origin })));
  }, [items, setPoints]);
  useEffect(() => () => setPoints([]), [setPoints]);

  const dirty = draftSockets !== null || Object.keys(draftPlacements).length > 0;

  // Leaving the page with unsaved rig changes asks first (the browser's own prompt).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // M and T pick the gizmo's tool.
  useShortcuts({ m: () => setEdit({ tool: "translate" }), t: () => setEdit({ tool: "rotate" }) });

  const undo = () => setMessage(stepWords(useStudioStore.getState().undoRig(), "Undone"));
  const redo = () => setMessage(stepWords(useStudioStore.getState().redoRig(), "Redone"));
  // Ctrl/Cmd+Z undoes, with Shift (or Ctrl+Y) redoes, as in the pose editor, unless the keys belong to a text field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      // The rig's own number fields commit as they change, so the keys undo the rig there too.
      const rigField = target instanceof HTMLInputElement && target.type === "number" && Boolean(target.closest("[data-rig-card]"));
      if (!rigField && target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && (target as HTMLInputElement).type !== "range") return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        setMessage(stepWords(useStudioStore.getState().undoRig(), "Undone"));
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        setMessage(stepWords(useStudioStore.getState().redoRig(), "Redone"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeMode = (mode: Exclude<EditMode, "off">) => {
    const target = mode === "sockets" ? (sockets.find((s) => s.id === edit.target)?.id ?? sockets[0]?.id ?? null) : (modelTargets.find(([key]) => key === edit.target)?.[0] ?? modelTargets[0]?.[0] ?? null);
    setEdit({ mode, target });
  };

  const discard = () => {
    st().clearDrafts();
    toast.info("Rig changes discarded");
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
      st().clearDrafts();
      onSaved();
      toast.success("Rig saved", draftSockets ? `${avatar.name}: attachment points updated` : "Model placement updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the rig");
    } finally {
      setSaving(false);
    }
  };

  const targetSocket = edit.mode === "sockets" ? sockets.find((s) => s.id === edit.target) : undefined;
  const targetPlacement = edit.mode === "model" && edit.target ? (draftPlacements[edit.target] ?? models[edit.target]?.placement) : undefined;
  const target = targetSocket ?? targetPlacement;
  const offset: Vec3 = (target?.offset ?? [0, 0, 0]) as Vec3;
  const { rotation, quaternion } = quatOrEuler(target?.rotation as number[] | undefined);
  const origin = targetSocket ? socketOrigin(targetSocket, detected) : null;
  const auto = targetSocket ? detected?.[targetSocket.id] : undefined;
  const name = targetSocket ? socketLabel(targetSocket.id) : edit.target ? equipmentLabel(edit.target) : "";

  const setOffset = (next: Vec3, stepping: boolean) => {
    if (!avatar) return;
    if (targetSocket) st().updateDraftSocket(avatar.id, saved, targetSocket.id, { offset: next }, { gesture: stepping, label: `Moved ${name}` });
    else if (targetPlacement && edit.target) st().setDraftPlacement(edit.target, { ...targetPlacement, offset: next }, { gesture: stepping, label: `Moved ${name}` });
  };
  const setRotation = (next: Vec3, stepping: boolean) => {
    if (!avatar) return;
    if (targetSocket) st().updateDraftSocket(avatar.id, saved, targetSocket.id, { rotation: next }, { gesture: stepping, label: `Rotated ${name}` });
    else if (targetPlacement && edit.target) st().setDraftPlacement(edit.target, { ...targetPlacement, rotation: next }, { gesture: stepping, label: `Rotated ${name}` });
  };

  return (
    <section aria-label="Rig editor" className="flex min-h-0 flex-1 flex-col text-xs" data-rig-editor>
      <div className="flex items-center gap-1 border-b border-(--m3-outline-variant) py-2 pr-2 pl-3">
        <Move3d className="h-4 w-4 shrink-0 text-(--m3-primary)" aria-hidden="true" />
        {/* The pane is titled "Rig editor": this names whose rig it is. */}
        <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold tracking-tight text-(--m3-on-surface)">
          <span className="truncate">{avatar?.name ?? "No avatar"}</span>
          {dirty ? (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--m3-warning)" title="Unsaved changes">
              <span className="sr-only">, unsaved changes</span>
            </span>
          ) : null}
        </h2>
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} className="h-8 w-8">
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} className="h-8 w-8">
          <Redo2 className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="studio-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <RigModeNote onBack={onBack} disabled={saving} />
        <Segmented label="What to edit" value={edit.mode as Exclude<EditMode, "off">} onChange={changeMode} size="sm" options={MODES} className="flex w-full [&>button]:flex-1" />

        <div className="space-y-1">
          <RigPointList
            items={items}
            selected={edit.target}
            empty={edit.mode === "model" ? "No generated model in this scene. Generate one under Equipment, then place it here." : "This avatar has no attachment point yet."}
            onSelect={(id) => setEdit({ target: id })}
          />
          {edit.mode === "model" && items.length ? (
            <p className="px-2 text-[11px] leading-snug text-(--m3-on-surface-variant)">A grip is set on the right hand and mirrored to the left; it is kept for every exercise.</p>
          ) : null}
          {edit.mode === "sockets" ? (
            adding ? (
              <AddPointForm
                bones={modelBones}
                taken={(id) => sockets.some((s) => s.id === id)}
                onCancel={() => setAdding(false)}
                onAdd={(id, bone) => {
                  if (!avatar) return;
                  st().addDraftSocket(avatar.id, saved, { id, bone, offset: [0, 0, 0], rotation: [0, 0, 0] });
                  setAdding(false);
                }}
              />
            ) : (
              <M3Button size="sm" variant="text" className="h-7 px-2" onClick={() => setAdding(true)} disabled={!modelBones.length}>
                <Plus className="h-3.5 w-3.5" /> Add point
              </M3Button>
            )
          ) : null}
        </div>

        {target && edit.target ? (
          <RigPointCard
            key={edit.target}
            name={name}
            under={targetSocket ? `on ${targetSocket.bone}` : `on ${modelTargets.find(([key]) => key === edit.target)?.[1] ?? "its attachment point"}`}
            origin={origin}
            offset={offset}
            rotation={rotation}
            rotationIsQuaternion={quaternion}
            onOffset={setOffset}
            onRotation={setRotation}
            onStepEnd={() => st().endRigGesture()}
            onReset={
              origin === "moved" && auto && avatar && targetSocket
                ? () => st().updateDraftSocket(avatar.id, saved, targetSocket.id, { bone: auto.bone, offset: auto.offset, rotation: auto.rotation ?? [0, 0, 0] }, { label: `Reset ${name} to detected` })
                : undefined
            }
            onRemove={avatar && targetSocket ? () => st().removeDraftSocket(avatar.id, saved, targetSocket.id) : undefined}
          />
        ) : items.length ? (
          <p className="rounded-xl bg-(--m3-surface-container) px-3 py-2.5 text-[11px] text-(--m3-on-surface-variant)">Select a point on the body or in the list to see its numbers.</p>
        ) : null}

        <RigTools />
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-(--m3-outline-variant) px-3 py-2.5">
        <span className="mr-auto text-[11px] text-(--m3-on-surface-variant)">{dirty ? "Unsaved changes" : "No unsaved changes"}</span>
        <span className="sr-only" role="status" aria-live="polite">
          {message}
        </span>
        <M3Button size="sm" variant="text" onClick={discard} disabled={!dirty || saving} title="Drop every unsaved rig change">
          <RotateCcw className="h-3.5 w-3.5" /> Discard
        </M3Button>
        <M3Button size="sm" variant="filled" onClick={save} disabled={!dirty} busy={saving}>
          {dirty ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} Save
        </M3Button>
      </div>
    </section>
  );
}
