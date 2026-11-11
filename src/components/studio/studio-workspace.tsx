"use client";

import { useCallback, useState } from "react";
import { defaultEquipmentItems } from "@/lib/studio/prompt";
import { useStudioStore } from "@/lib/studio/store";
import { defaultDraft, templateExerciseOf } from "@/lib/studio/template-draft";
import type { MovementVector } from "@/lib/studio/types";
import { AvatarDialog } from "./avatar-dialog";
import { AvatarManageDialog } from "./avatar-manage-dialog";
import { CatalogSidebar } from "./catalog-sidebar";
import { EquipmentDialog } from "./equipment-dialog";
import { useExerciseLanding } from "./hooks/use-exercise-landing";
import { usePoseSave } from "./hooks/use-pose-save";
import { useTemplateExerciseSync } from "./hooks/use-template-settings";
import { useSelectionGuard } from "./hooks/use-selection-guard";
import { useStudioData } from "./hooks/use-studio-data";
import { useVectorActions } from "./hooks/use-vector-actions";
import { useWorkerDriver } from "./hooks/use-worker-driver";
import { InspectorPanel } from "./inspector-panel";
import { PoseEditor } from "./pose-editor";
import { PosesPlaceholder } from "./poses-placeholder";
import { RIGHT_TAB_IDS, RightPaneTabs, type RightTab } from "./right-pane-tabs";
import { RigEditor } from "./rig-editor";
import { SettingsDialog } from "./settings-dialog";
import { DockPreview, useDockPreview } from "./shell/dock-preview";
import { StudioShell } from "./shell/studio-shell";
import { CurrentExercise, TopbarTools } from "./topbar-tools";
import { StudioViewport } from "./viewer/studio-viewport";

/** The right pane's tab, back on Poses whenever another exercise is picked (adjusted during render, not in an effect). */
function useRightTab(exerciseId: string | null) {
  const [state, setState] = useState<{ tab: RightTab; exerciseId: string | null }>({ tab: "poses", exerciseId });
  if (state.exerciseId !== exerciseId) setState({ tab: "poses", exerciseId });
  const setTab = useCallback((tab: RightTab) => setState((s) => ({ ...s, tab })), []);
  return [state.exerciseId === exerciseId ? state.tab : "poses", setTab] as const;
}

/**
 * The Studio page: data and selection (useStudioData), the pipeline driver, vector actions and
 * the pose editor's lifecycle are hooks; this component wires them to the shell, the panes and
 * the dialogs. It never subscribes to the pose draft itself, so slider ticks stay in the editor
 * and the canvas.
 */
export function StudioWorkspace() {
  const data = useStudioData();
  const { exercises, avatars, settings, vectors, vectorsLoaded, exercise, avatar, catalogLoading, vectorsLoading, equipmentCodes, supportCodes, queuedAnywhere, mutateVectors, mutateCatalog } = data;
  const setAvatar = useStudioStore((s) => s.setAvatar);
  const setVector = useStudioStore((s) => s.setVector);
  const stopPoseEdit = useStudioStore((s) => s.stopPoseEdit);
  const poseEditing = useStudioStore((s) => Boolean(s.poseEdit));
  const [tab, setTab] = useRightTab(exercise?.id ?? null);
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
  // The exercise's template, for its settings in the editor and for drags in Exercise mode.
  useTemplateExerciseSync(exercise);
  const actions = useVectorActions({ exercise, avatar, refresh, onEditPoses: poses.onEditPoses });
  // Picking an exercise lands on editable poses (its clip, or the instant template draft).
  const plan = useExerciseLanding({ exercise, avatar, vectors, vectorsLoaded, active: tab === "poses", onEditPoses: poses.onEditPoses, onOpenDraft: poses.onOpenDraft });
  const startFromTemplate = () => {
    if (exercise && avatar) poses.onOpenDraft(defaultDraft(templateExerciseOf(exercise)), defaultEquipmentItems(exercise, avatar.sockets));
  };

  /** A row of Clips & queue: a ready pose clip opens in the editor, another ready clip plays, a queued row is selected. */
  const openVector = (vector: MovementVector) => {
    const s = useStudioStore.getState();
    if (vector.status !== "ready") {
      setVector(vector.id === s.vectorId ? null : vector.id);
      return;
    }
    if (vector.format === "json" && s.poseEdit?.vectorId === vector.id) {
      setTab("poses");
      return;
    }
    void guard("clip").then((ok) => {
      if (!ok) return;
      stopPoseEdit();
      setVector(vector.id);
      // The landing opens the chosen clip (it is the preferred one now) once the Poses tab shows.
      if (vector.format === "json") setTab("poses");
    });
  };

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
        rightTitle="Animation"
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
            {exercise ? <RightPaneTabs value={tab} onChange={setTab} clipCount={vectors.length} /> : null}
            {exercise && tab === "poses" ? (
              <div role="tabpanel" id={RIGHT_TAB_IDS.poses.panel} aria-labelledby={RIGHT_TAB_IDS.poses.tab} className="flex min-h-0 flex-1 flex-col">
                {poseEditing ? (
                  <PoseEditor onSave={poses.onSavePoses} saving={poses.saving} onDraft={poses.onDraftPoses} drafting={poses.drafting} onRevert={stopPoseEdit} />
                ) : (
                  <PosesPlaceholder plan={plan} onStartFromTemplate={startFromTemplate} />
                )}
              </div>
            ) : null}
            {/* Kept mounted (hidden) on the Poses tab, so the prompt, equipment and pipeline being
                written survive a round trip, and its equipment stays drawn on the avatar. */}
            <div
              hidden={Boolean(exercise) && tab !== "clips"}
              role={exercise ? "tabpanel" : undefined}
              id={RIGHT_TAB_IDS.clips.panel}
              aria-labelledby={exercise ? RIGHT_TAB_IDS.clips.tab : undefined}
              className="flex min-h-0 flex-1 flex-col"
            >
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
                onOpenVector={openVector}
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
