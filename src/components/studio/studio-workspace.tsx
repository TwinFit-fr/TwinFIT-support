"use client";

import { useCallback, useState } from "react";
import { ChevronDown, Download, Dumbbell, Plus, Settings2, Users } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { downloadStudioAsset } from "@/lib/studio/asset-auth";
import { useStudioStore } from "@/lib/studio/store";
import { studioAssetUrl } from "@/lib/studio/storage-url";
import type { BaseAvatar } from "@/lib/studio/types";
import { AvatarDialog } from "./avatar-dialog";
import { AvatarManageDialog } from "./avatar-manage-dialog";
import { CatalogSidebar } from "./catalog-sidebar";
import { EquipmentDialog } from "./equipment-dialog";
import { usePoseSave } from "./hooks/use-pose-save";
import { useSelectionGuard } from "./hooks/use-selection-guard";
import { useStudioData } from "./hooks/use-studio-data";
import { useVectorActions } from "./hooks/use-vector-actions";
import { useWorkerDriver } from "./hooks/use-worker-driver";
import { InspectorPanel } from "./inspector-panel";
import { PoseEditor } from "./pose-editor";
import { RigEditor } from "./rig-editor";
import { SettingsDialog } from "./settings-dialog";
import { StudioShell } from "./studio-shell";
import { IconButton, M3Button } from "./ui";
import { StudioViewport } from "./viewer/studio-viewport";

function AvatarMenu({
  avatars,
  selected,
  onSelect,
  onAdd,
  onManage,
}: {
  avatars: BaseAvatar[];
  selected: BaseAvatar | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onManage: () => void;
}) {
  const toast = useToast();
  const modelUrl = selected ? studioAssetUrl(selected.file_id, selected.model_url) : null;
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={selected?.id ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Base avatar"
          className="studio-state h-8 cursor-pointer appearance-none rounded-full border border-(--m3-outline-variant) bg-(--m3-surface-container-high) pl-3 pr-8 text-xs text-(--m3-on-surface) outline-none focus-visible:border-(--m3-primary)"
        >
          {!avatars.length ? <option value="">No avatar</option> : null}
          {avatars.map((a) => (
            <option key={a.id} value={a.id} disabled={a.status !== "ready"}>
              {a.name} · {a.subject} · {a.rig}
              {a.is_default ? " · default" : ""}
              {a.status === "processing" || a.status === "pending" ? ` · building ${a.progress}%` : a.status === "error" ? " · failed" : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--m3-on-surface-variant)" />
      </div>
      <M3Button size="sm" variant="outlined" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" /> Avatar
      </M3Button>
      <IconButton label="Manage the avatars (rename, default, retry, delete)" onClick={onManage} className="h-8 w-8">
        <Users className="h-3.5 w-3.5" />
      </IconButton>
      {modelUrl && selected ? (
        <IconButton
          label="Download this avatar's .glb (upload it to a capture tool as a custom character so its exports fit the rig)"
          onClick={() => void downloadStudioAsset(modelUrl, `${selected.code.toLowerCase()}.glb`).catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Download failed"))}
          className="h-8 w-8"
        >
          <Download className="h-3.5 w-3.5" />
        </IconButton>
      ) : null}
    </div>
  );
}

/**
 * The Studio page: data and selection (useStudioData), the pipeline driver, vector actions and
 * the pose editor's lifecycle are hooks; this component wires them to the shell, the panes and
 * the dialogs. It never subscribes to the pose draft itself, so slider ticks stay in the editor
 * and the canvas.
 */
export function StudioWorkspace() {
  const data = useStudioData();
  const { exercises, avatars, settings, vectors, exercise, avatar, catalogLoading, vectorsLoading, equipmentCodes, supportCodes, queuedAnywhere, mutateVectors, mutateCatalog } = data;
  const setAvatar = useStudioStore((s) => s.setAvatar);
  const poseEditing = useStudioStore((s) => Boolean(s.poseEdit));
  const guard = useSelectionGuard();

  const refresh = useCallback(() => Promise.all([mutateVectors(), mutateCatalog()]), [mutateVectors, mutateCatalog]);

  // The pipeline runs from here while any exercise has queued rows; a tick that claimed a row refreshes the lists.
  const hasPendingHere = vectors.some((v) => v.status === "pending");
  useWorkerDriver(
    queuedAnywhere > 0 || hasPendingHere,
    useCallback(
      (claimed) => {
        if (claimed) void refresh();
        else void mutateVectors();
      },
      [refresh, mutateVectors],
    ),
  );

  const poses = usePoseSave({ exercise, avatar, settings, refresh });
  const actions = useVectorActions({ exercise, avatar, refresh, onEditPoses: poses.onEditPoses });

  const [avatarDialog, setAvatarDialog] = useState(false);
  const [manageDialog, setManageDialog] = useState(false);
  const [equipmentDialog, setEquipmentDialog] = useState(false);
  const [settingsDialog, setSettingsDialog] = useState(false);

  const chooseAvatar = (id: string) => {
    if (id === avatar?.id) return;
    void guard("avatar").then((ok) => {
      if (ok) setAvatar(id);
    });
  };

  return (
    <>
      <StudioShell
        topbar={
          <div className="flex items-center gap-4">
            {exercise ? (
              <span className="hidden max-w-[32ch] truncate text-sm text-(--m3-on-surface-variant) lg:block">
                <span className="text-(--m3-on-surface)">{exercise.display_name}</span>
                <span className="ml-2 font-mono text-[11px] opacity-60">#{exercise.exo_id}</span>
              </span>
            ) : null}
            <AvatarMenu avatars={avatars} selected={avatar} onSelect={chooseAvatar} onAdd={() => setAvatarDialog(true)} onManage={() => setManageDialog(true)} />
            <M3Button size="sm" variant="outlined" onClick={() => setEquipmentDialog(true)} title="3D models of the catalog equipment">
              <Dumbbell className="h-3.5 w-3.5" /> Equipment
            </M3Button>
            <IconButton label="Studio settings (pipeline, defaults, prompt template, storage)" onClick={() => setSettingsDialog(true)} disabled={!settings} className="h-8 w-8">
              <Settings2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        }
        left={<CatalogSidebar exercises={exercises} loading={catalogLoading} />}
        center={
          <>
            <StudioViewport />
            <RigEditor
              avatar={avatar}
              onSaved={() => {
                void data.mutateAvatars();
                void data.mutateEquipment();
              }}
            />
          </>
        }
        right={
          poseEditing ? (
            <PoseEditor onSave={poses.onSavePoses} saving={poses.saving} onDraft={poses.onDraftPoses} drafting={poses.drafting} />
          ) : (
            <InspectorPanel
              // Remounted per exercise (fresh draft); an avatar change keeps what you typed.
              key={exercise?.id ?? "none"}
              exercise={exercise}
              avatar={avatar}
              settings={settings}
              vectors={vectors}
              vectorsLoading={vectorsLoading}
              equipmentCodes={equipmentCodes}
              supportCodes={supportCodes}
              generating={actions.generating}
              busyVectorId={actions.busyVectorId}
              onGenerate={actions.onGenerate}
              onVectorAction={actions.onVectorAction}
              onUploadClip={actions.onUploadClip}
              onNewPoses={poses.onNewPoses}
            />
          )
        }
      />
      {equipmentDialog ? <EquipmentDialog onClose={() => setEquipmentDialog(false)} onChanged={() => void data.mutateEquipment()} /> : null}
      {settingsDialog && settings ? <SettingsDialog settings={settings} onClose={() => setSettingsDialog(false)} onSaved={() => void data.mutateSettings()} /> : null}
      {manageDialog ? (
        <AvatarManageDialog
          avatars={avatars}
          onClose={() => setManageDialog(false)}
          onChanged={() => {
            void data.mutateAvatars();
            void data.mutateCatalog();
          }}
        />
      ) : null}
      {avatarDialog ? (
        <AvatarDialog
          hasDefault={avatars.some((a) => a.is_default)}
          onClose={() => setAvatarDialog(false)}
          onCreated={(created) => {
            setAvatarDialog(false);
            void data.mutateAvatars();
            if (created.status === "ready") setAvatar(created.id);
          }}
        />
      ) : null}
    </>
  );
}
