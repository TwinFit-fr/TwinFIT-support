"use client";

import { create } from "zustand";
import type { ClipProblem } from "@/lib/studio/clip-problems";
import { studioAssetUrl } from "@/lib/studio/storage-url";

/**
 * Clip rows found unusable during this visit (clip-problems.ts): the stage's loader and the pose
 * editor report them, and the row, the Poses tab and the landing read them, so a file that did not
 * load or a .json that holds no poses is said once, in words, where the user looks, and is not
 * opened again as if nothing happened. Each problem belongs to the file it was found in: a row
 * whose file is replaced is tried afresh. Kept apart from the main store so the canvas never
 * re-renders for it.
 */
type Entry = { url: string; problem: ClipProblem };

export const useClipProblems = create<{
  problems: Record<string, Entry>;
  report: (vectorId: string, url: string, problem: ClipProblem) => void;
}>((set) => ({
  problems: {},
  report: (vectorId, url, problem) =>
    set((s) => {
      const known = s.problems[vectorId];
      if (known && known.url === url) {
        // A file that does not load says more than "not poses"; the same problem twice changes nothing.
        if (known.problem.kind === "unreadable" && problem.kind === "not-poses") return s;
        if (known.problem.kind === problem.kind && known.problem.detail === problem.detail) return s;
      }
      return { problems: { ...s.problems, [vectorId]: { url, problem } } };
    }),
}));

type FileOf = { id: string; file_id: string | null; vector_url: string | null };

/** The file a row's problem is about (the URL the stage loads). */
export const clipFileUrl = (vector: Pick<FileOf, "file_id" | "vector_url">): string => studioAssetUrl(vector.file_id, vector.vector_url) ?? "";

/** The problem found in this row's current file, if any. */
export function problemOf(problems: Record<string, Entry>, vector: FileOf | null | undefined): ClipProblem | null {
  if (!vector) return null;
  const entry = problems[vector.id];
  return entry && entry.url === clipFileUrl(vector) ? entry.problem : null;
}

export const useClipProblem = (vector: FileOf | null | undefined): ClipProblem | null => useClipProblems((s) => problemOf(s.problems, vector));

/** Report a problem found in a row's current file. */
export const reportClipProblem = (vector: FileOf, problem: ClipProblem) => useClipProblems.getState().report(vector.id, clipFileUrl(vector), problem);
