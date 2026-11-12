"use client";

import { useRef } from "react";
import { Bone, Coins, Link2, Sparkles, Upload } from "lucide-react";
import { MESHY_AVATAR, shortEstimate } from "@/lib/studio/paid-actions";
import { rovingIndex } from "@/lib/studio/roving";
import { cn } from "@/lib/utils";

export type AvatarSource = "generate" | "upload" | "url" | "style";

type SourceInfo = { value: AvatarSource; title: string; meta: string; icon: typeof Bone; paid?: boolean; about: string };

/** The free, instant mannequin comes first; the paid build is last and says its cost where it is chosen. */
export const AVATAR_SOURCES: SourceInfo[] = [
  {
    value: "generate",
    title: "Mannequin",
    meta: "Free · ready in seconds",
    icon: Bone,
    about: "A neutral mannequin built right here, on the standard skeleton every Studio clip can drive. No file and no cost. Its attachment points are placed for you.",
  },
  {
    value: "upload",
    title: "Upload a model",
    meta: "Your rigged .glb or .gltf",
    icon: Upload,
    about: "A rigged character file from your computer. Attachment points start on default bones; correct them on the model in the rig editor.",
  },
  {
    value: "url",
    title: "From a link",
    meta: "A .glb at an https address",
    icon: Link2,
    about: "The Studio downloads the model from the link (Ready Player Me, a file host). Attachment points start on default bones; correct them in the rig editor.",
  },
  {
    value: "style",
    title: "TwinFIT character",
    meta: `Paid · ${shortEstimate(MESHY_AVATAR)}`,
    icon: Sparkles,
    paid: true,
    about: `Meshy builds the catalog's character from the style's reference image, rigs it and stores it (about ${MESHY_AVATAR.credits} credits, ${MESHY_AVATAR.duration}). It runs in the background: follow it in Jobs. The cost is confirmed before anything is sent.`,
  },
];

/**
 * Where the new avatar comes from, as a vertical list of choices (a radio group: Tab lands on the
 * chosen one, the arrow keys move the choice).
 */
export function AvatarSourceList({ value, onChange, disabled }: { value: AvatarSource; onChange: (next: AvatarSource) => void; disabled?: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  const current = AVATAR_SOURCES.findIndex((s) => s.value === value);
  return (
    <div
      ref={list}
      role="radiogroup"
      aria-label="Where the avatar comes from"
      className="flex flex-col gap-1"
      onKeyDown={(event) => {
        const next = rovingIndex(event.key, current, AVATAR_SOURCES.length, "vertical");
        if (next === null || disabled) return;
        event.preventDefault();
        onChange(AVATAR_SOURCES[next].value);
        list.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
      }}
    >
      {AVATAR_SOURCES.map((source) => {
        const active = source.value === value;
        const Icon = source.icon;
        return (
          <button
            key={source.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            data-source={source.value}
            data-autofocus={active ? "" : undefined}
            onClick={() => onChange(source.value)}
            className={cn(
              "studio-state relative flex w-full cursor-pointer items-start gap-3 rounded-(--studio-radius-md) px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70 disabled:cursor-not-allowed disabled:opacity-50",
              active ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "text-(--m3-on-surface)",
            )}
          >
            {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-(--m3-primary)" /> : null}
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-(--studio-radius-sm)",
                active ? "bg-(--m3-primary) text-(--m3-on-primary)" : "bg-(--m3-surface-container-highest) text-(--m3-on-surface-variant)",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium leading-tight">{source.title}</span>
              <span className={cn("mt-0.5 flex items-center gap-1 text-[12px] leading-snug", active ? "text-(--m3-on-secondary-container)/85" : "text-(--m3-on-surface-variant)")}>
                {source.paid ? <Coins aria-hidden className="h-3 w-3 shrink-0" /> : null}
                {source.meta}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
