"use client";

import { useCallback, useState } from "react";
import { useStudioStore } from "@/lib/studio/store";
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
import { DockPreview, useDockPreview } from "./shell/dock-preview";
import { StudioShell } from "./shell/studio-shell";
import { CurrentExercise, TopbarTools } from "./topbar-tools";
import { StudioViewport } from "./viewer/studio-viewport";

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
  const dockPreview = useDockPreview();

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
        title={<CurrentExercise exercise={exercise} />}
        rightTitle={poseEditing ? "Pose editor" : "Inspector"}
        tools={
          <TopbarTools
            avatars={avatars}
            selected={avatar}
            settingsReady={Boolean(settings)}
            onSelectAvatar={chooseAvatar}
            onAddAvatar={() => setAvatarDialog(true)}
            onManageAvatars={() => setManageDialog(true)}
            onEquipment={() => setEquipmentDialog(true)}
            onSettings={() => setSettingsDialog(true)}
          />
        }
        // The bottom dock holds the timeline once it exists; until then it is empty (no space).
        dock={dockPreview ? <DockPreview /> : undefined}
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
          <>
            {poseEditing ? <PoseEditor onSave={poses.onSavePoses} saving={poses.saving} onDraft={poses.onDraftPoses} drafting={poses.drafting} /> : null}
            {/* Kept mounted (hidden) while the pose editor is open, so the prompt, equipment and
                pipeline being written survive a round trip to the editor. */}
            <div hidden={poseEditing} className="flex min-h-0 flex-1 flex-col">
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
            </div>
          </>
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
