"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { useToast } from "@/components/ui/toast";
import { CAPTURE_FPS, keyPosesFromCapture, readCapture, type CaptureFrames } from "@/lib/studio/capture-convert";
import { unusedParts } from "@/lib/studio/capture-words";
import { nameKeyPoses } from "@/lib/studio/key-pose-names";
import type { Detail } from "@/lib/studio/key-poses";
import { buildRig, type Rig } from "@/lib/studio/pose-clip";
import type { CaptureOrigin, DraftOrigin } from "@/lib/studio/pose-origin";
import { useStudioStore } from "@/lib/studio/store";
import { defaultDraft, templateExerciseOf } from "@/lib/studio/template-draft";
import type { PoseAngles } from "@/lib/studio/anatomy";
import type { BaseAvatar, EquipmentItem, MovementVector, StudioExercise } from "@/lib/studio/types";
import { useCaptureStage } from "../viewer/capture-stage";
import { clipFileUrl, useClipProblems } from "./use-clip-problems";

/**
 * "Edit as key poses" on a capture: the motion the stage plays (retargeted to the avatar) is read
 * frame by frame into the editor's angles a slice at a time, reduced to a few key poses and opened
 * in the pose editor, like any other draft. The request waits for the capture to be on the stage,
 * and is dropped if another exercise or avatar is picked meanwhile. The frames read stay here, so
 * the Detail setting rebuilds the key poses from them at once.
 */

export type CaptureJob = {
  vectorId: string;
  /** The capture's file (a problem found in it ends the request). */
  url: string;
  seq: number | null;
  format: string;
  exerciseId: string;
  avatarId: string;
  items: EquipmentItem[];
  /** Waiting for the capture on the stage, or reading its frames. */
  stage: "waiting" | "reading";
  done: number;
  total: number;
  startedAt: number;
};

export const useCaptureEdit = create<{ job: CaptureJob | null; setJob: (job: CaptureJob | null) => void; progress: (done: number, total: number) => void }>((set) => ({
  job: null,
  setJob: (job) => set({ job }),
  progress: (done, total) => set((s) => (s.job ? { job: { ...s.job, stage: "reading", done, total } } : s)),
}));

/** The exercise's template poses, whose names the key poses take (key-pose-names.ts). */
type Reference = { poses: PoseAngles[]; labels: string[] | null } | null;
type Read = { frames: CaptureFrames; rig: Rig; unused: string[]; reference: Reference };

/** Frames read from each capture on each avatar, for the Detail setting (the last few only). */
const read = new Map<string, Read>();
const keyOf = (vectorId: string, avatarId: string) => `${vectorId}:${avatarId}`;

/** The key poses of the frames at a detail level, named in the exercise's words. */
function keyPoses(kept: Read, detail: Detail) {
  const keys = keyPosesFromCapture(kept.frames, kept.rig, detail);
  return { ...keys, labels: nameKeyPoses({ poses: keys.poses, frames: keys.frames, rig: kept.rig, reference: kept.reference }) };
}

function remember(key: string, value: Read) {
  read.delete(key);
  read.set(key, value);
  while (read.size > 4) read.delete(read.keys().next().value!);
}

/** Ask for a capture row to open in the editor as key poses (it plays on the stage first if it is not already). */
export function requestCaptureEdit(vector: MovementVector, exerciseId: string, avatarId: string) {
  useCaptureEdit.getState().setJob({
    vectorId: vector.id,
    url: clipFileUrl(vector),
    seq: vector.seq,
    format: vector.format,
    exerciseId,
    avatarId,
    items: vector.equipment?.items ?? [],
    stage: "waiting",
    done: 0,
    total: 0,
    startedAt: performance.now(),
  });
}

/** The origin of key poses built from frames at a detail level. */
function captureOrigin(job: Pick<CaptureJob, "vectorId" | "seq" | "format">, frames: CaptureFrames, keys: { poses: unknown[]; frames: number[]; maxDiff: number }, detail: Detail, unused: string[]): Extract<DraftOrigin, { kind: "capture" }> {
  const origin: CaptureOrigin = {
    vectorId: job.vectorId,
    seq: job.seq,
    format: job.format,
    keys: keys.poses.length,
    keyFrames: keys.frames,
    frames: frames.times.length,
    maxDiff: keys.maxDiff,
    detail,
    missing: frames.missing,
    unused,
    travel: frames.travel,
    clamped: frames.clamped,
  };
  return { kind: "capture", ...origin };
}

/** Mounted once (the workspace): runs a requested conversion when its capture is on the stage. */
export function useCaptureEditDriver(input: { exercise: StudioExercise | null; avatar: BaseAvatar | null; onOpened: () => void }) {
  const { exercise, avatar, onOpened } = input;
  const job = useCaptureEdit((s) => s.job);
  const stage = useCaptureStage((s) => s.current);
  const toast = useToast();

  // Another exercise or avatar: a request for the previous one is dropped.
  useEffect(() => {
    if (job && (job.exerciseId !== exercise?.id || job.avatarId !== avatar?.id)) useCaptureEdit.getState().setJob(null);
  }, [job, exercise, avatar]);

  // A capture whose file did not load ends the request at once: the Poses tab says what is wrong with it.
  const failed = useClipProblems((s) => {
    const entry = job ? s.problems[job.vectorId] : undefined;
    return Boolean(entry && job && entry.url === job.url && entry.problem.kind === "unreadable");
  });
  useEffect(() => {
    if (failed) useCaptureEdit.getState().setJob(null);
  }, [failed]);

  // A capture that never reaches the stage (and reports nothing) does not leave the button waiting.
  const waitingFor = job?.stage === "waiting" ? job.vectorId : null;
  useEffect(() => {
    if (!waitingFor) return;
    const timer = window.setTimeout(() => {
      const now = useCaptureEdit.getState().job;
      if (now?.vectorId !== waitingFor || now.stage !== "waiting") return;
      useCaptureEdit.getState().setJob(null);
      toast.error("The capture did not load on the stage, so it could not be read. Try it again, or check the file.", `Capture #${now.seq}`);
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [waitingFor, toast]);

  useEffect(() => {
    if (!job || job.stage !== "waiting" || !exercise || !avatar) return;
    if (!stage || stage.vectorId !== job.vectorId || stage.avatarId !== job.avatarId) return;
    const mine = job;
    const stopped = () => {
      const s = useStudioStore.getState();
      return s.exerciseId !== mine.exerciseId || s.avatarId !== mine.avatarId || useCaptureEdit.getState().job?.vectorId !== mine.vectorId;
    };
    useCaptureEdit.getState().progress(0, 1);
    const rig = buildRig(stage.model, stage.rest);
    const driven = new Set(Object.keys(stage.report.mapped));
    readCapture(rig, { clip: stage.clip, driven }, { stopped, onProgress: (done, total) => useCaptureEdit.getState().progress(done, total) })
      .then((frames) => {
        if (!frames || stopped()) return;
        const unused = unusedParts(stage.report.unmatched);
        const draft = defaultDraft(templateExerciseOf(exercise));
        const kept: Read = { frames, rig, unused, reference: draft.labels ? { poses: draft.poses, labels: draft.labels } : null };
        remember(keyOf(mine.vectorId, mine.avatarId), kept);
        const keys = keyPoses(kept, "balanced");
        useStudioStore.getState().startPoseEdit({
          vectorId: null,
          sourceSeq: null,
          exerciseId: mine.exerciseId,
          avatarId: mine.avatarId,
          items: mine.items,
          poses: keys.poses,
          labels: keys.labels,
          weights: keys.weights,
          mode: keys.mode,
          durationS: Number(frames.duration.toFixed(3)),
          fps: CAPTURE_FPS,
          twoHanded: false,
          grip: null,
          // A capture is not symmetrical: an edit on one side stays on that side.
          mirror: false,
          meta: { exo_id: exercise.exo_id, avatar_code: avatar.code, rig: avatar.rig, source_vector: mine.vectorId, capture: { format: mine.format, frames: frames.times.length } },
          origin: captureOrigin(mine, frames, keys, "balanced", unused),
        });
        useCaptureEdit.getState().setJob(null);
        // How long it took from the press to the editor, for the capture scripts and the HUD.
        (window as unknown as { __studioCaptureMs?: number }).__studioCaptureMs = Math.round(performance.now() - mine.startedAt);
        onOpened();
      })
      .catch((err: unknown) => {
        if (useCaptureEdit.getState().job?.vectorId === mine.vectorId) useCaptureEdit.getState().setJob(null);
        toast.error(err instanceof Error ? err.message : "The capture could not be read", `Capture #${mine.seq}`);
      });
  }, [job, stage, exercise, avatar, onOpened, toast]);
}

/** Whether the editor's capture poses can be rebuilt at another detail (its frames are still here). */
export function captureFramesKept(origin: DraftOrigin, avatarId: string): boolean {
  return origin.kind === "capture" && read.has(keyOf(origin.vectorId, avatarId));
}

/** What a Detail change did: rebuilt (other key poses), or the same key poses as before. */
export type CaptureRebuild = { changed: boolean; keys: number; maxDiff: number };

/**
 * Rebuild the editor's key poses from the capture at another detail: one undo step. Returns null
 * when the frames are gone (the page was reloaded since): the capture must be opened again.
 */
export function rebuildFromCapture(detail: Detail): CaptureRebuild | null {
  const state = useStudioStore.getState();
  const edit = state.poseEdit;
  if (!edit || edit.origin.kind !== "capture") return null;
  const kept = read.get(keyOf(edit.origin.vectorId, edit.avatarId));
  if (!kept) return null;
  const keys = keyPoses(kept, detail);
  const same = !edit.edited && keys.frames.join() === (edit.origin.keyFrames ?? []).join() && keys.mode === edit.mode;
  state.replacePoses({
    poses: keys.poses,
    labels: keys.labels,
    weights: keys.weights,
    mode: keys.mode,
    origin: captureOrigin(edit.origin, kept.frames, keys, detail, kept.unused),
    keyframe: same ? edit.keyframe : 0,
    edited: false,
  });
  return { changed: !same, keys: keys.poses.length, maxDiff: keys.maxDiff };
}
