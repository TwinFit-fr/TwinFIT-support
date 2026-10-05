"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { CHECKER_STYLE } from "@/components/images/checker";
import { Button } from "@/components/ui/primitives";
import {
  RunInputsPanel,
  type AutomaticInput,
  type RunReferences,
} from "@/components/images/run-inputs-panel";
import { PROMPT_PLACEHOLDERS } from "@/lib/images/prompt";
import type {
  MuscleMapBoardTarget,
  MuscleMapImage,
  MuscleMapView,
  StyleReference,
} from "@/lib/images/types";
import { MUSCLE_MAP_VIEWS } from "@/lib/images/types";
import { imageThumbUrl } from "@/lib/images/urls";
import { cn } from "@/lib/utils";
import { VIEW_LABEL } from "./muscle-map-card";

export type MuscleMapRun = { promptOverride?: string; referenceIds?: string[] };

function ViewColumn({
  view,
  images,
  hasBase,
  busy,
  onGenerate,
  onActivate,
  onDeactivate,
  onDelete,
}: {
  view: MuscleMapView;
  images: MuscleMapImage[];
  hasBase: boolean;
  busy: boolean;
  onGenerate: () => void;
  onActivate: (image: MuscleMapImage) => void;
  onDeactivate: (image: MuscleMapImage) => void;
  onDelete: (image: MuscleMapImage) => void;
}) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const shown =
    images.find((img) => img.id === pickedId) ?? images.find((img) => img.active) ?? images[0];
  const url = imageThumbUrl(shown?.image_url, 720);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">{VIEW_LABEL[view]}</h3>
        <Button
          type="button"
          className="h-8 px-3 text-xs"
          disabled={busy || !hasBase}
          title={hasBase ? undefined : `Add the ${view} base on Styles first`}
          onClick={onGenerate}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generate"}
        </Button>
      </div>
      <div
        className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-zinc-200"
        style={CHECKER_STYLE}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={VIEW_LABEL[view]} className="h-full w-full object-contain" />
        ) : (
          <span className="px-4 text-center text-xs text-zinc-500">
            {hasBase ? (
              "No map yet"
            ) : (
              <>
                No {view} base.{" "}
                <Link href="/images/styles" className="underline">
                  Add it on Styles
                </Link>
              </>
            )}
          </span>
        )}
        {shown?.active && (
          <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
            Active
          </span>
        )}
      </div>
      {shown && (
        <div className="flex flex-wrap gap-1.5">
          {shown.active ? (
            <Button
              type="button"
              variant="secondary"
              className="h-7 px-2.5 text-xs"
              onClick={() => onDeactivate(shown)}
            >
              Deactivate
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                className="h-7 px-2.5 text-xs"
                onClick={() => onActivate(shown)}
              >
                Make active
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-7 px-2.5 text-xs"
                onClick={() => onDelete(shown)}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      )}
      {images.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setPickedId(img.id)}
              className={cn(
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-md border",
                img.id === shown?.id ? "border-zinc-900" : "border-zinc-200",
              )}
              style={CHECKER_STYLE}
              title={new Date(img.created_at).toLocaleString()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageThumbUrl(img.image_url, 120) ?? ""}
                alt=""
                className="h-full w-full object-contain"
              />
              {img.active && (
                <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Side panel for one muscle or group: both views, their history and a one-off prompt. */
export function MuscleMapInspector({
  target,
  template,
  bases,
  library,
  busyViews,
  onClose,
  onGenerate,
  onActivate,
  onDeactivate,
  onDelete,
}: {
  target: MuscleMapBoardTarget;
  /** The style's muscle map prompt, the starting point of a one-off edit. */
  template: string;
  /** The style's base file per view. */
  bases: { view: MuscleMapView; file_id: string }[];
  /** Every reference of the style; the ones linked to this target start on. */
  library: StyleReference[];
  busyViews: MuscleMapView[];
  onClose: () => void;
  onGenerate: (view: MuscleMapView, run: MuscleMapRun) => void;
  onActivate: (image: MuscleMapImage) => void;
  onDeactivate: (image: MuscleMapImage) => void;
  onDelete: (image: MuscleMapImage) => void;
}) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const edited = prompt != null && prompt !== template;
  const [references, setReferences] = useState<RunReferences>(undefined);
  const baseViews = bases.map((b) => b.view);
  const linked = library.filter((r) =>
    r.links.some((l) => l.kind === target.kind && l.id === target.id),
  );
  const automatic: AutomaticInput[] = MUSCLE_MAP_VIEWS.map((view) => ({
    label: `Base · ${VIEW_LABEL[view]}`,
    detail: `For the ${view} map`,
    fileId: bases.find((b) => b.view === view)?.file_id ?? null,
  }));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const run: MuscleMapRun = {
    ...(edited ? { promptOverride: prompt ?? undefined } : {}),
    ...(references !== undefined ? { referenceIds: references } : {}),
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="muscle-map-inspector-title"
        className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="muscle-map-inspector-title" className="truncate text-lg font-semibold">
              {target.name}
            </h2>
            <p className="text-xs text-zinc-500">
              {target.kind === "muscle_group" ? "Muscle group" : "Muscle"} · {target.code}
              {target.description ? ` · ${target.description}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {MUSCLE_MAP_VIEWS.map((view) => (
              <ViewColumn
                key={view}
                view={view}
                images={target.images.filter((img) => img.view === view)}
                hasBase={baseViews.includes(view)}
                busy={busyViews.includes(view)}
                onGenerate={() => onGenerate(view, run)}
                onActivate={onActivate}
                onDeactivate={onDeactivate}
                onDelete={onDelete}
              />
            ))}
          </div>

          <RunInputsPanel
            automatic={automatic}
            linked={linked}
            library={library}
            value={references}
            onChange={setReferences}
            note="Each map edits the base of its view; library references are sent with both views."
            disabled={busyViews.length > 0}
          />

          <section className="rounded-lg border border-zinc-200">
            <button
              type="button"
              onClick={() => setPromptOpen((v) => !v)}
              aria-expanded={promptOpen}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="text-sm font-medium text-zinc-900">
                Prompt
                {edited && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                    edited for this run
                  </span>
                )}
              </span>
              <span className="text-xs text-zinc-500">{promptOpen ? "Hide" : "Edit"}</span>
            </button>
            {promptOpen && (
              <div className="space-y-2 border-t border-zinc-100 px-3 py-3">
                <textarea
                  className="min-h-48 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs"
                  value={prompt ?? template}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Placeholders: {PROMPT_PLACEHOLDERS.muscleMap.join(", ")}</span>
                  {edited && (
                    <button
                      type="button"
                      className="text-zinc-600 underline"
                      onClick={() => setPrompt(null)}
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500">
                  Not saved: it applies to the next Generate here. Edit the style prompt on{" "}
                  <Link href="/images/prompts" className="underline">
                    Prompts
                  </Link>
                  .
                </p>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
