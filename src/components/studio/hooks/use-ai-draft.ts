"use client";

import { useCallback, useEffect } from "react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { aiFate, sameDraft, type AiRequest, type DraftIdentity } from "@/lib/studio/ai-draft-request";
import { aiReplacement, handMadeWork, keepHandWork, replacementSummary, type AiDraftResponse } from "@/lib/studio/ai-draft-result";
import { useAiDraftStore } from "@/lib/studio/ai-draft-store";
import { useDragModeStore } from "@/lib/studio/drag-mode";
import { useStudioStore, type PoseEditState } from "@/lib/studio/store";

/** One request at a time, page-wide: a new one, a cancel or another draft aborts the previous. */
let controller: AbortController | null = null;
let nextId = 0;

/** The open draft, while it is the selected exercise's and avatar's (a picked exercise leaves the old draft open for a moment). */
const identityOf = (edit: PoseEditState | null, selected: { exerciseId: string | null; avatarId: string | null } = useStudioStore.getState()): DraftIdentity | null =>
  edit && edit.exerciseId === selected.exerciseId && edit.avatarId === selected.avatarId ? { exerciseId: edit.exerciseId, avatarId: edit.avatarId, editId: edit.editId } : null;

/** The exercise's template as the stage reads it, only when it is the request's exercise. */
const templateFor = (exerciseId: string) => {
  const s = useDragModeStore.getState();
  return s.exerciseId === exerciseId ? s.exercise : null;
};

function abort() {
  controller?.abort();
  controller = null;
}

/** An answer arrived: applied, offered as a suggestion, or dropped (see aiFate). */
function land(request: AiRequest, draft: AiDraftResponse) {
  const studio = useStudioStore.getState();
  const edit = studio.poseEdit;
  const ex = templateFor(request.exerciseId);
  const built = edit ? aiReplacement(draft, ex, edit.keyframe, request.instructions) : null;
  // What was set by hand is kept when the answer is built on the template and the poses match: nothing is lost then.
  const keep = edit && built ? keepHandWork(edit, ex, built) : null;
  const fate = aiFate(request, useAiDraftStore.getState().latestId, identityOf(edit), Boolean(edit && !keep && handMadeWork(edit, ex)));
  if (fate === "discard" || !edit || !built) return;
  const next = keep?.next ?? built;
  if (fate === "apply") {
    studio.replacePoses(next);
    useAiDraftStore.setState({ landed: { requestId: request.id, at: Date.now() }, suggestion: null });
  } else {
    useAiDraftStore.setState({ suggestion: { request, next, summary: replacementSummary(edit, next, ex) } });
  }
}

/**
 * The language-model draft, started from the settings group. It never blocks the editor: the
 * request is tied to the draft it was started from, can be cancelled, and its answer lands as if
 * the user had set the settings, or as a suggestion when the poses hold work made by hand.
 */
export function useAiDraft() {
  const staffFetch = useStaffFetch();

  const start = useCallback(
    async (instructions: string) => {
      const edit = useStudioStore.getState().poseEdit;
      if (!edit) return;
      abort();
      const own = new AbortController();
      controller = own;
      const request: AiRequest = { id: ++nextId, exerciseId: edit.exerciseId, avatarId: edit.avatarId, editId: edit.editId, instructions: instructions.trim(), startedAt: Date.now() };
      useAiDraftStore.setState({ pending: request, latestId: request.id, suggestion: null, failure: null, landed: null });
      try {
        const body = (await staffFetch("/api/studio/poses/draft", {
          method: "POST",
          signal: own.signal,
          body: JSON.stringify({
            exercise_id: edit.exerciseId,
            avatar_id: edit.avatarId,
            items: edit.items,
            two_handed: edit.twoHanded,
            instructions: request.instructions || null,
            pose_count: null,
          }),
        })) as { draft: AiDraftResponse };
        if (!own.signal.aborted) land(request, body.draft);
      } catch (err) {
        if (own.signal.aborted || useAiDraftStore.getState().latestId !== request.id) return;
        useAiDraftStore.setState({ failure: { request, message: err instanceof Error ? err.message : "Could not draft the poses" } });
      } finally {
        if (useAiDraftStore.getState().pending?.id === request.id) useAiDraftStore.setState({ pending: null });
        if (controller === own) controller = null;
      }
    },
    [staffFetch],
  );

  const cancel = useCallback(() => {
    abort();
    useAiDraftStore.setState({ pending: null, latestId: null });
  }, []);

  /** Apply the waiting suggestion: one undo step that brings back poses, settings, origin and meta together. */
  const apply = useCallback(() => {
    const { suggestion } = useAiDraftStore.getState();
    const studio = useStudioStore.getState();
    const edit = studio.poseEdit;
    if (!suggestion || !edit || !sameDraft(suggestion.request, identityOf(edit))) {
      useAiDraftStore.setState({ suggestion: null });
      return;
    }
    studio.replacePoses({ ...suggestion.next, keyframe: Math.min(edit.keyframe, suggestion.next.poses.length - 1) });
    useAiDraftStore.setState({ suggestion: null, landed: { requestId: suggestion.request.id, at: Date.now() } });
  }, []);

  const dismiss = useCallback(() => useAiDraftStore.setState({ suggestion: null }), []);
  const clearFailure = useCallback(() => useAiDraftStore.setState({ failure: null }), []);

  return { start, cancel, apply, dismiss, clearFailure };
}

/**
 * Another draft opened (another exercise, avatar or clip, a revert) or the editor closed: the
 * request in flight is aborted and a waiting suggestion or failure is dropped, so nothing lands on
 * work it was not asked for. Mounted once by the workspace; it does not re-render it.
 */
export function useAiDraftLifecycle() {
  useEffect(
    () =>
      useStudioStore.subscribe((state, prev) => {
        if (state.poseEdit?.editId === prev.poseEdit?.editId && state.exerciseId === prev.exerciseId && state.avatarId === prev.avatarId) return;
        const now = identityOf(state.poseEdit, state);
        const ai = useAiDraftStore.getState();
        const stale = (r: AiRequest | null | undefined) => Boolean(r && !sameDraft(r, now));
        if (stale(ai.pending)) abort();
        if (stale(ai.pending) || stale(ai.suggestion?.request) || stale(ai.failure?.request)) {
          useAiDraftStore.setState({
            pending: stale(ai.pending) ? null : ai.pending,
            latestId: stale(ai.pending) ? null : ai.latestId,
            suggestion: stale(ai.suggestion?.request) ? null : ai.suggestion,
            failure: stale(ai.failure?.request) ? null : ai.failure,
          });
        }
      }),
    [],
  );
}
