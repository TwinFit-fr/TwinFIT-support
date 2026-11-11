"use client";

import { useId } from "react";
import { ArrowLeft, CloudOff, ListX, Loader2, PersonStanding, Plus } from "lucide-react";
import type { StageState, StatusFocus } from "@/lib/studio/load-state";
import { cn } from "@/lib/utils";
import { ErrorState, StudioLoader } from "./load-states";
import { M3Button } from "./ui";

/** The one sentence a first run reads, on the stage and in the side panel. */
const NO_AVATAR_SENTENCE = "Poses are shown and edited on a base avatar; the mannequin is free and ready in a few seconds.";

export type Mannequin = { create: () => void; busy: boolean };

/**
 * The stage before it can draw an avatar: the list still loading, a failed list (Retry), the
 * first run (one click makes the free mannequin), or a paid build on its way.
 */
export function StageFallback({
  stage,
  error,
  onRetry,
  mannequin,
  onMoreOptions,
}: {
  stage: Exclude<StageState, { kind: "ready" }>;
  error?: unknown;
  onRetry: () => unknown;
  mannequin: Mannequin;
  onMoreOptions: () => void;
}) {
  if (stage.kind === "loading") return <StudioLoader label="Loading avatars…" />;
  if (stage.kind === "failed") {
    return (
      <div className="flex h-full items-center justify-center">
        <ErrorState title="The avatar list did not load." error={error} onRetry={onRetry} />
      </div>
    );
  }
  const building = stage.kind === "building" ? stage : null;
  return (
    <div className="flex h-full items-center justify-center p-6">
      <section aria-labelledby="stage-first-run-title" className="flex max-w-[22rem] flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-(--m3-surface-container-high) text-(--m3-primary)">
          <PersonStanding aria-hidden className="h-7 w-7" />
        </span>
        <div>
          <h2 id="stage-first-run-title" className="text-base font-semibold tracking-tight text-(--m3-on-surface)">
            {building ? `${building.name} is being built · ${building.progress}%` : "No avatar yet"}
          </h2>
          <p className="mt-1.5 text-(length:--studio-text-sm) leading-relaxed text-(--m3-on-surface-variant)">
            {building ? "Meshy takes 3 to 5 minutes and it opens here by itself. The mannequin is free and instant if you want to start now." : NO_AVATAR_SENTENCE}
          </p>
          {building ? (
            <div
              role="progressbar"
              aria-label={`${building.name} build`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={building.progress}
              className="mx-auto mt-3 h-1 w-48 overflow-hidden rounded-full bg-(--m3-surface-container-highest)"
            >
              <div className="h-full rounded-full bg-(--m3-primary)" style={{ width: `${building.progress}%` }} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <M3Button variant={building ? "tonal" : "filled"} size="lg" busy={mannequin.busy} onClick={mannequin.create}>
            {mannequin.busy ? null : <PersonStanding aria-hidden className="h-4 w-4" />}
            {mannequin.busy ? "Creating the mannequin…" : "Create the mannequin"}
          </M3Button>
          <M3Button variant="text" size="sm" onClick={onMoreOptions} disabled={mannequin.busy}>
            <Plus aria-hidden className="h-3.5 w-3.5" /> Other avatar options
          </M3Button>
        </div>
      </section>
    </div>
  );
}

/**
 * The side panel's note for what has to happen before step 1, and where to do it. It never holds
 * the button itself: the stage (or the catalog) has the one action, so a newcomer sees a single
 * primary button, and the panel says in plain words where it is.
 */
export function PanelStatusNote({ focus, className }: { focus: StatusFocus; className?: string }) {
  const titleId = useId();
  const note = NOTES[focus.kind](focus as never);
  const Icon = note.icon;
  return (
    <section
      aria-labelledby={titleId}
      role={focus.kind === "loading" ? "status" : undefined}
      className={cn(
        "rounded-(--studio-radius-lg) border bg-(--m3-surface-container) p-4",
        note.tone === "error" ? "border-(--m3-error)/40" : note.tone === "quiet" ? "border-(--m3-outline-variant)" : "border-(--m3-primary)/45",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-(--studio-radius-md)",
            note.tone === "error" ? "bg-(--m3-error-container) text-(--m3-error)" : note.tone === "quiet" ? "bg-(--m3-surface-container-high) text-(--m3-on-surface-variant)" : "bg-(--m3-primary-container) text-(--m3-on-primary-container)",
          )}
        >
          <Icon aria-hidden className={cn("h-4 w-4", focus.kind === "loading" && "motion-safe:animate-spin")} />
        </span>
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-[12px] font-semibold leading-tight text-(--m3-on-surface)">
            {note.title}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-(--m3-on-surface-variant)">{note.body}</p>
          {note.where ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium leading-snug text-(--m3-primary)">
              <ArrowLeft aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
              {note.where}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type Note = { icon: typeof PersonStanding; tone: "primary" | "error" | "quiet"; title: string; body: string; where?: string };

const NOTES: { [K in StatusFocus["kind"]]: (focus: Extract<StatusFocus, { kind: K }>) => Note } = {
  loading: () => ({ icon: Loader2, tone: "quiet", title: "Getting the workspace ready…", body: "The catalog and the avatars are loading." }),
  "no-avatar": () => ({ icon: PersonStanding, tone: "primary", title: "First, a base avatar", body: NO_AVATAR_SENTENCE, where: "Use the button on the stage" }),
  building: (f) => ({
    icon: PersonStanding,
    tone: "primary",
    title: `${f.name} is being built · ${f.progress}%`,
    body: "Meshy takes 3 to 5 minutes and it opens on the stage by itself.",
    where: "Or start now with the free mannequin on the stage",
  }),
  "avatars-failed": () => ({ icon: CloudOff, tone: "error", title: "The avatar list did not load", body: "Poses are shown on an avatar, so nothing can open until the list loads.", where: "Use Retry on the stage" }),
  "catalog-failed": () => ({ icon: CloudOff, tone: "error", title: "The catalog did not load", body: "Exercises are picked from the catalog, so nothing can open until it loads.", where: "Use Retry in the catalog" }),
  "catalog-empty": () => ({ icon: ListX, tone: "quiet", title: "The catalog has no exercises", body: "Exercises show in the catalog once they are added to TwinFIT." }),
};
