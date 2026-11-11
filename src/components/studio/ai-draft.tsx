"use client";

import { useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { M3Button, TextArea } from "./ui";

export type DraftRequest = { instructions: string; poseCount: number | null };

/**
 * An exercise without a template opens on one neutral pose: the obvious next step is one click
 * that asks the model for the key poses (the editor stays usable while it works).
 */
export function NoTemplateCallout({ onDraft, drafting }: { onDraft: (request: DraftRequest) => Promise<void>; drafting: boolean }) {
  return (
    <div className="rounded-(--studio-radius-lg) border border-(--m3-primary)/35 bg-(--m3-primary-container)/25 p-3">
      <p className="text-[12px] font-medium leading-snug text-(--m3-on-surface)">This exercise has no template yet.</p>
      <p className="mt-0.5 text-[11px] leading-snug text-(--m3-on-surface-variant)">
        The AI reads the catalog&apos;s texts and frames and writes the key poses here, in about ten seconds. You can keep posing meanwhile; undo brings your poses back.
      </p>
      <M3Button variant="filled" className="mt-2.5 w-full" busy={drafting} onClick={() => void onDraft({ instructions: "", poseCount: null })}>
        {drafting ? null : <Sparkles className="h-4 w-4" />}
        {drafting ? "Drafting the poses…" : "Draft with AI"}
      </M3Button>
    </div>
  );
}

/** The model's draft with optional instructions ("deeper squat"): replaces the poses, one undo step. */
export function AiDraftPanel({ onDraft, drafting }: { onDraft: (request: DraftRequest) => Promise<void>; drafting: boolean }) {
  const [instructions, setInstructions] = useState("");
  return (
    <div className="mt-2 space-y-2 rounded-2xl border border-(--m3-outline-variant) bg-(--m3-surface-container-low) p-3">
      <TextArea
        rows={2}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional instructions: “deeper squat”, “wide stance”, “wide grip”, “slower on the way down”…"
        aria-label="Instructions for the AI draft"
        className="text-[11px]"
      />
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[10px] text-(--m3-on-surface-variant)">Builds the exercise&apos;s template; the AI reads the catalog&apos;s texts and frames for depth, stance, grip and tempo. Replaces the poses here (undo brings yours back).</span>
        <M3Button size="sm" variant="filled" busy={drafting} onClick={() => void onDraft({ instructions, poseCount: null })}>
          <Wand2 className="h-3.5 w-3.5" /> Draft
        </M3Button>
      </div>
    </div>
  );
}
