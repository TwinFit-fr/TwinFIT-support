"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useAccessToken } from "@nhost/react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { avatarJobs, equipmentJobs, generationJobs, mergeJobs, vectorsPollMs, watchedExercises, type StudioJob } from "@/lib/studio/jobs";
import { listVectors } from "@/lib/studio/studio-api";
import type { BaseAvatar, MovementVector, StudioEquipment, StudioExercise } from "@/lib/studio/types";

const DISMISSED_KEY = "studio.jobs.dismissed";
const DISMISSED_MAX = 300;

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Finished jobs this viewer dismissed (a per-browser convenience; the rows themselves stay). */
function useDismissed() {
  const [dismissed, setDismissed] = useState<string[]>(() => (typeof window === "undefined" ? [] : readDismissed()));
  const dismiss = useCallback((ids: string[]) => {
    setDismissed((list) => {
      const next = [...new Set([...list, ...ids])].slice(-DISMISSED_MAX);
      try {
        window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked: dismissed for this session only */
      }
      return next;
    });
  }, []);
  return [useMemo(() => new Set(dismissed), [dismissed]), dismiss] as const;
}

/** A clock for elapsed times: every second while the tray shows running jobs, else every 30 s. */
export function useNow(fast: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Fresh as soon as the pace changes (the tray opening shows exact times), then on the beat.
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const id = window.setInterval(() => setNow(Date.now()), fast ? 1000 : 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [fast]);
  return now;
}

/**
 * Every background job of the Studio in one list: the movement rows of each exercise that has
 * queued work (the open exercise's rows come from the workspace, the others are fetched here in
 * one request per poll), the avatars and the equipment models. An exercise stays watched once it
 * had queued rows, so its outcome (done or failed) shows after the queue empties.
 */
export function useStudioJobs(input: {
  exercises: StudioExercise[];
  exerciseId: string | null;
  vectors: MovementVector[];
  avatars: BaseAvatar[];
  equipment: StudioEquipment[];
  currentAvatarId: string | null;
  stalled: boolean;
  now: number;
}) {
  const { exercises, exerciseId, vectors, avatars, equipment, currentAvatarId, stalled, now } = input;
  const staffFetch = useStaffFetch();
  const token = useAccessToken();

  const queuedNow = useMemo(() => exercises.filter((e) => e.vectors.queued > 0).map((e) => e.id), [exercises]);
  const [watched, setWatched] = useState<string[]>([]);
  const nextWatched = watchedExercises(queuedNow, watched);
  if (nextWatched.length !== watched.length) setWatched(nextWatched);
  const others = nextWatched.filter((id) => id !== exerciseId);
  // The key carries each exercise's queued count, so a catalog refresh that shows new queued work refetches the rows.
  const queuedCount = useMemo(() => new Map(exercises.map((e) => [e.id, e.vectors.queued])), [exercises]);
  const keyParts = others.map((id) => `${id}:${queuedCount.get(id) ?? 0}`);

  // A number, not a function: SWR restarts its timer whenever refreshInterval changes, and this
  // component re-renders every second while the tray is open. It follows each answer.
  const [pollMs, setPollMs] = useState(0);
  const { data: otherVectors, mutate: mutateOthers } = useSWR<MovementVector[]>(
    token && keyParts.length ? ["studio-job-vectors", ...keyParts] : null,
    async ([, ...parts]: string[]) => {
      const ids = parts.map((part) => part.split(":")[0]);
      const lists = (await Promise.all(ids.map((id) => listVectors(staffFetch, id)))) as { vectors: MovementVector[] }[];
      return lists.flatMap((l) => l.vectors);
    },
    { refreshInterval: pollMs, onSuccess: (rows) => setPollMs(vectorsPollMs(rows)), revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 2000 },
  );

  const names = useMemo(() => new Map(exercises.map((e) => [e.id, e.display_name])), [exercises]);
  const [dismissed, dismiss] = useDismissed();

  const jobs: StudioJob[] = useMemo(() => {
    // The open exercise's rows first: they are the freshest (its list refreshes after every action).
    const rows = [...vectors, ...(otherVectors ?? []).filter((v) => v.exercise_id !== exerciseId)];
    return mergeJobs(
      [
        generationJobs(rows, { now, exerciseName: (id) => names.get(id) ?? null, stalled }),
        avatarJobs(avatars, { now, currentAvatarId }),
        equipmentJobs(equipment, { now }),
      ],
      dismissed,
    );
  }, [vectors, otherVectors, exerciseId, now, names, stalled, avatars, currentAvatarId, equipment, dismissed]);

  return { jobs, dismiss, refreshOthers: mutateOthers };
}
