"use client";

import { useMemo } from "react";
import { useConfirm } from "@/components/ui/confirm";

/**
 * Runs above this many images ask first. One exercise (two subjects × three frames) or one
 * target's maps never do, so everyday regenerations start at once.
 */
export const CONFIRM_RUN_ABOVE = 6;

/**
 * The one rule for confirming OpenAI generations. A run asks only when it is large; a style
 * asset (character, support, muscle base, library image) asks only when generating it replaces
 * the current image or ignores unsaved style edits.
 */
export function useGenerationConfirm() {
  const confirm = useConfirm();
  return useMemo(
    () => ({
      run: async (images: number): Promise<boolean> =>
        images <= CONFIRM_RUN_ABOVE ||
        confirm({
          title: `Generate ${images} images?`,
          description: `This starts ${images} OpenAI image generations.`,
          confirmLabel: `Generate ${images}`,
        }),
      asset: async ({
        name,
        replacing,
        unsaved = false,
      }: {
        name: string;
        replacing: boolean;
        unsaved?: boolean;
      }): Promise<boolean> => {
        if (!replacing && !unsaved) return true;
        const notes = [
          replacing && `The current ${name} is replaced in every generation that uses it.`,
          unsaved && "Unsaved style changes are ignored: the saved style is used.",
        ].filter(Boolean);
        return confirm({
          title: replacing ? `Replace the ${name}?` : `Generate the ${name}?`,
          description: notes.join("\n\n"),
          confirmLabel: replacing ? "Generate and replace" : "Generate",
        });
      },
    }),
    [confirm],
  );
}
