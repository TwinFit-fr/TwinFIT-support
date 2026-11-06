"use client";

import { useSyncExternalStore } from "react";

/**
 * Counts the React commits of the 3D canvas, outside React state so the HUD can show the number
 * without the canvas knowing. Development aid: the count should not move while typing in the
 * inspector, scrolling the catalog or while the queue polls.
 */
let canvasCommits = 0;
const listeners = new Set<() => void>();

export function recordCanvasCommit(): void {
  canvasCommits += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCanvasCommits(): number {
  return useSyncExternalStore(
    subscribe,
    () => canvasCommits,
    () => 0,
  );
}
