"use client";

import { useCallback, useState } from "react";
import { guideFocus, stageBlocksEditing, stageNote } from "@/lib/studio/load-state";
import { defaultEquipmentItems } from "@/lib/studio/prompt";
import { useStudioStore } from "@/lib/studio/store";
import { defaultDraft, templateExerciseOf } from "@/lib/studio/template-draft";
import type { StudioJob } from "@/lib/studio/jobs";
import type { BaseAvatar, MovementVector } from "@/lib/studio/types";
import { AvatarDialog } from "./avatar-dialog";
import { AvatarManageDialog } from "./avatar-manage-dialog";
import { CatalogSidebar } from "./catalog-sidebar";
import { EquipmentDialog } from "./equipment-dialog";
import { useAiDraftLifecycle } from "./hooks/use-ai-draft";
import { useExerciseLanding } from "./hooks/use-exercise-landing";
import { useOneClickMannequin } from "./hooks/use-mannequin";
import { usePoseSave } from "./hooks/use-pose-save";
import { useTemplateExerciseSync } from "./hooks/use-template-settings";
import { useSelectionGuard } from "./hooks/use-selection-guard";
import { useStudioData } from "./hooks/use-studio-data";
import { useVectorActions } from "./hooks/use-vector-actions";
import { useWorkerDriver } from "./hooks/use-worker-driver";
import { InspectorPanel } from "./inspector-panel";
import { JobsCenter, JobsSlot, useJobsTray } from "./jobs/jobs-center";
import { ErrorState, StudioLoader } from "./load-states";
import { PoseEditor } from "./pose-editor";
import { PosesPlaceholder } from "./poses-placeholder";
import { RIGHT_TAB_IDS, RightPaneTabs, type RightTab } from "./right-pane-tabs";
import { RigEditor, RigEditorButton } from "./rig-editor";
import { SettingsDialog } from "./settings-dialog";
import { DockPreview, useDockPreview } from "./shell/dock-preview";
import { StageStartHint } from "./shell/stage-start-hint";
import { StudioShell } from "./shell/studio-shell";
import { ToolDivider } from "./shell/tool-button";
import { PanelStatusNote, StageFallback } from "./stage-states";
import { StudioConfirmHost } from "./studio-confirm";
import { TimelineDock } from "./timeline/timeline-dock";
import { useTimelineShown } from "./timeline/use-timeline";
import { CurrentExercise, TopbarTools } from "./topbar-tools";
import { StudioViewport } from "./viewer/studio-viewport";

/**
 * The right pane's tab, back on Poses whenever another exercise is picked (adjusted during render,
 * not in an effect). `setTabFor` picks the tab another exercise opens on (the jobs tray's "Show in queue").
 */
function useRightTab(exerciseId: string | null) {
  const [state, setState] = useState<{ tab: RightTab; exerciseId: string | null }>({ tab: "poses", exerciseId });
  if (state.exerciseId !== exerciseId) setState({ tab: "poses", exerciseId });
  const setTab = useCallback((tab: RightTab) => setState((s) => ({ ...s, tab })), []);
  const setTabFor = useCallback((tab: RightTab, forExercise: string) => setState({ tab, exerciseId: forExercise }), []);
  return [state.exerciseId === exerciseId ? state.tab : "poses", setTab, setTabFor] as const;
}

/**
 * The Studio page: data and selection (useStudioData), the pipeline driver, vector actions and
 * the pose editor's lifecycle are hooks; this component wires them to the shell, the panes and
 * the dialogs. It never subscribes to the pose draft itself, so slider ticks stay in the editor
 * and the canvas.
 */
export function StudioWorkspace() {
  const data = useStudioData();
  const { exercises, avatars, settings, vectors, vectorsLoaded, exercise, avatar, stage, vectorsLoading, equipmentCodes, supportCodes, queuedAnywhere, mutateVectors, mutateCatalog, mutateAvatars } = data;
  const setAvatar = useStudioStore((s) => s.setAvatar);
  const setVector = useStudioStore((s) => s.setVector);
  const selectExercise = useStudioStore((s) => s.selectExercise);
  const setJobsOpen = useJobsTray((s) => s.setOpen);
  // The shell places the open tray (beside the stage, or in the catalog's place); a toggle re-renders the shell only for that.
  const jobsOpen = useJobsTray((s) => s.open);
  const stopPoseEdit = useStudioStore((s) => s.stopPoseEdit);
  const poseEditing = useStudioStore((s) => Boolean(s.poseEdit));
  // Posing pauses while the rig editor is open: the editor takes the side pane and says so, the timeline steps aside.
  const rigOpen = useStudioStore((s) => s.edit.mode !== "off");
  const [tab, setTab, setTabFor] = useRightTab(exercise?.id ?? null);
  const guard = useSelectionGuard();
  const dockPreview = useDockPreview();
  // The timeline takes the dock while a pose draft or a clip is open; with nothing open the dock takes no space.
  const timelineShown = useTimelineShown();

  const refresh = useCallback(() => Promise.all([mutateVectors(), mutateCatalog()]), [mutateVectors, mutateCatalog]);

  // The pipeline runs from here while any exercise has queued rows; a tick that claimed a row refreshes the lists.
  const hasPendingHere = vectors.some((v) => v.status === "pending");
  const queue = useWorkerDriver(
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
  // An AI draft in flight or waiting is dropped when another draft opens, so it never lands on another exercise.
  useAiDraftLifecycle();
  // The exercise's template, for its settings in the editor and for drags in Exercise mode.
  useTemplateExerciseSync(exercise);
  const actions = useVectorActions({
    exercise,
    avatar,
    defaultModel: typeof settings?.pipeline.model === "string" ? settings.pipeline.model : null,
    refresh,
    onEditPoses: poses.onEditPoses,
  });
  // Picking an exercise lands on editable poses (its clip, or the instant template draft).
  const plan = useExerciseLanding({ exercise, avatar, vectors, vectorsLoaded, active: tab === "poses" && !rigOpen, onEditPoses: poses.onEditPoses, onOpenDraft: poses.onOpenDraft });
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

  // A new avatar goes on the stage through the unsaved-work guard; a build that started shows in the jobs tray.
  const onAvatarCreated = useCallback(
    (created: BaseAvatar) => {
      setAvatarDialog(false);
      void mutateAvatars();
      if (created.status === "ready") {
        void guard("avatar").then((ok) => {
          if (ok) setAvatar(created.id);
        });
      } else setJobsOpen(true);
    },
    [mutateAvatars, setAvatar, guard, setJobsOpen],
  );
  // First run: one click on the stage makes the free in-browser mannequin; the side panel says where it is.
  const mannequin = useOneClickMannequin({ hasDefault: avatars.some((a) => a.is_default), onCreated: onAvatarCreated });
  // What has to happen before step 1 (loading, a failed list, no avatar yet), or "pick" once everything is in.
  const focus = guideFocus(data.catalogState, stage);
  // Without an avatar on the stage no pose draft shows (its Draft with AI and Save would act on nothing visible).
  const blocked = stageBlocksEditing(stage);
  const note = stageNote(stage);
  const clipsFailed = data.vectorsState === "failed" ? (data.vectorsError ?? true) : undefined;

  const chooseAvatar = (id: string) => {
    if (id === avatar?.id) return;
    void guard("avatar").then((ok) => {
      if (ok) setAvatar(id);
    });
  };

  /** A job of the tray: a finished clip opens in the editor, any other row shows in its exercise's queue. */
  const openGeneration = (job: StudioJob) => {
    const { exerciseId, vectorId } = job;
    if (!exerciseId || !vectorId) return;
    if (exerciseId === exercise?.id) {
      const row = vectors.find((v) => v.id === vectorId);
      if (row?.status === "ready") return openVector(row);
      setVector(vectorId);
      return setTab("clips");
    }
    void guard("exercise").then((ok) => {
      if (!ok) return;
      selectExercise(exerciseId);
      setVector(vectorId);
      // A finished clip lands in the editor (the landing opens the chosen clip); the rest show in the queue.
      setTabFor(job.state === "done" ? "poses" : "clips", exerciseId);
    });
  };

  return (
    <>
      <StudioShell
        title={<CurrentExercise exercise={exercise} catalog={data.catalogState} editingShown={!blocked && !rigOpen} />}
        rightTitle={rigOpen ? "Rig editor" : "Animation"}
        tools={
          <>
            <JobsCenter
              exercises={exercises}
              exerciseId={exercise?.id ?? null}
              vectors={vectors}
              avatars={avatars}
              equipment={data.equipment}
              currentAvatarId={avatar?.id ?? null}
              defaultModel={typeof settings?.pipeline.model === "string" ? settings.pipeline.model : null}
              ready={data.avatarsState !== "loading" && data.equipmentLoaded}
              queue={queue}
              onOpenGeneration={openGeneration}
              onUseAvatar={chooseAvatar}
              onOpenEquipment={() => setEquipmentDialog(true)}
              onChanged={(kind) => void (kind === "generation" ? refresh() : kind === "avatar" ? mutateAvatars() : data.mutateEquipment())}
            />
            <ToolDivider />
            <TopbarTools
              avatars={avatars}
              avatarsState={data.avatarsState}
              selected={avatar}
              settingsState={data.settingsState}
              onRetrySettings={() => void data.mutateSettings()}
              onSelectAvatar={chooseAvatar}
              onAddAvatar={() => setAvatarDialog(true)}
              onManageAvatars={() => setManageDialog(true)}
              onEquipment={() => setEquipmentDialog(true)}
              onSettings={() => setSettingsDialog(true)}
            />
          </>
        }
        stageSide={<JobsSlot />}
        stageSideOpen={jobsOpen}
        onStageSideClose={() => setJobsOpen(false)}
        dock={rigOpen ? undefined : timelineShown && stage.kind === "ready" ? <TimelineDock /> : dockPreview ? <DockPreview /> : undefined}
        left={<CatalogSidebar exercises={exercises} state={data.catalogState} error={data.catalogError} onRetry={mutateCatalog} />}
        center={
          // Until an avatar can be drawn the stage says why (loading, failed, first run), never "no avatar" too early.
          stage.kind === "ready" ? (
            <>
              <StudioViewport />
              {focus.kind === "pick" ? <StageStartHint /> : null}
              {rigOpen ? null : <RigEditorButton avatar={avatar} />}
            </>
          ) : (
            <StageFallback stage={stage} error={data.avatarsError} onRetry={mutateAvatars} mannequin={mannequin} onMoreOptions={() => setAvatarDialog(true)} />
          )
        }
        right={
          <>
            {/* The rig editor takes the pane while it is open: posing pauses, and nothing of it covers the body. */}
            {rigOpen ? (
              <RigEditor
                avatar={avatar}
                onBack={() => void guard("rig-close")}
                onSaved={() => {
                  void data.mutateAvatars();
                  void data.mutateEquipment();
                }}
              />
            ) : null}
            {exercise && !rigOpen ? <RightPaneTabs value={tab} onChange={setTab} clipCount={vectors.length} /> : null}
            {exercise && tab === "poses" && !rigOpen ? (
              <div role="tabpanel" id={RIGHT_TAB_IDS.poses.panel} aria-labelledby={RIGHT_TAB_IDS.poses.tab} className="flex min-h-0 flex-1 flex-col">
                {stage.kind === "loading" ? (
                  <StudioLoader className="h-auto py-10" label="Loading avatars…" />
                ) : note ? (
                  // No avatar to draw on: say why and where to act (the stage holds the one button).
                  <div className="p-4">
                    <PanelStatusNote focus={note} />
                  </div>
                ) : poseEditing ? (
                  <PoseEditor onSave={poses.onSavePoses} saving={poses.saving} onRevert={stopPoseEdit} />
                ) : clipsFailed && plan?.kind === "wait" ? (
                  <ErrorState className="py-10" title="The clips of this exercise did not load." error={clipsFailed} onRetry={() => mutateVectors()} />
                ) : (
                  <PosesPlaceholder plan={plan} onStartFromTemplate={startFromTemplate} />
                )}
              </div>
            ) : null}
            {/* Kept mounted (hidden) on the Poses tab, so the prompt, equipment and pipeline being
                written survive a round trip, and its equipment stays drawn on the avatar. */}
            <div
              hidden={rigOpen || (Boolean(exercise) && tab !== "clips")}
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
                vectorsFailed={clipsFailed}
                onRetryVectors={() => mutateVectors()}
                guide={focus}
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
      <StudioConfirmHost />
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
        <AvatarDialog hasDefault={avatars.some((a) => a.is_default)} onClose={() => setAvatarDialog(false)} onCreated={onAvatarCreated} />
      ) : null}
    </>
  );
}
